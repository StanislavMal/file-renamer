package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// ============ Работа с файлами ============

// GetFilesInDirectory возвращает список файлов в директории
func (a *App) GetFilesInDirectory(dirPath string) ([]FileInfo, error) {
	if dirPath == "" {
		return []FileInfo{}, nil
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("не удалось прочитать директорию: %w", err)
	}

	var files []FileInfo
	for _, entry := range entries {
		if !entry.IsDir() {
			files = append(files, FileInfo{
				Name: entry.Name(),
				Path: filepath.Join(dirPath, entry.Name()),
			})
		}
	}

	// Естественная сортировка
	naturalSort(files)

	return files, nil
}

// SelectFolder открывает диалог выбора папки
func (a *App) SelectFolder(currentPath string) (string, error) {
	if currentPath == "" {
		if home, err := os.UserHomeDir(); err == nil {
			currentPath = home
		}
	}

	selectedPath, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Выберите папку",
		DefaultDirectory: currentPath,
	})

	if err != nil {
		return "", err
	}

	return selectedPath, nil
}

// ============ Построение плана переименования ============

// BuildPlanFromPairs строит план из пар файлов
func (a *App) BuildPlanFromPairs(targetDir string, pairs map[string]string) PlanResult {
	result := PlanResult{
		Operations: []RenameOp{},
		Conflicts:  []Conflict{},
	}

	if targetDir == "" || len(pairs) == 0 {
		return result
	}

	type candidate struct {
		targetName string
		sourceName string
		oldPath    string
		newPath    string
		newName    string
	}

	var candidates []candidate
	oldPaths := make(map[string]struct{})

	// Собираем кандидатов
	for targetName, sourceName := range pairs {
		oldPath := filepath.Join(targetDir, targetName)
		newName := computeNewName(targetName, sourceName)
		newPath := filepath.Join(targetDir, newName)

		oldPaths[normalizePathForFS(oldPath)] = struct{}{}
		candidates = append(candidates, candidate{
			targetName: targetName,
			sourceName: sourceName,
			oldPath:    oldPath,
			newPath:    newPath,
			newName:    newName,
		})
	}

	// Проверяем конфликты дублирования
	invalid := make(map[string]string)
	seenNew := make(map[string]string)

	for _, c := range candidates {
		normNew := normalizePathForFS(c.newPath)
		if prevTarget, exists := seenNew[normNew]; exists && normNew != normalizePathForFS(c.oldPath) {
			invalid[c.targetName] = fmt.Sprintf("конфликт нового имени с «%s»", prevTarget)
		} else {
			seenNew[normNew] = c.targetName
		}
	}

	// Валидируем кандидатов
	for _, c := range candidates {
		if reason, bad := invalid[c.targetName]; bad {
			result.Conflicts = append(result.Conflicts, Conflict{
				TargetName: c.targetName,
				SourceName: c.sourceName,
				NewName:    c.newName,
				Reason:     reason,
			})
			continue
		}

		if samePathRelaxed(c.oldPath, c.newPath) {
			result.Conflicts = append(result.Conflicts, Conflict{
				TargetName: c.targetName,
				SourceName: c.sourceName,
				NewName:    c.newName,
				Reason:     "исходное и новое имя совпадают",
			})
			continue
		}

		if fi, err := os.Stat(c.newPath); err == nil && fi.Mode().IsRegular() {
			if _, willBeRenamed := oldPaths[normalizePathForFS(c.newPath)]; !willBeRenamed {
				result.Conflicts = append(result.Conflicts, Conflict{
					TargetName: c.targetName,
					SourceName: c.sourceName,
					NewName:    c.newName,
					Reason:     "в целевой папке уже есть файл с таким именем",
				})
				continue
			}
		}

		result.Operations = append(result.Operations, RenameOp{
			OldPath:    c.oldPath,
			NewPath:    c.newPath,
			OldName:    c.targetName,
			NewName:    c.newName,
			SourceName: c.sourceName,
		})
	}

	// Сортируем операции
	sort.Slice(result.Operations, func(i, j int) bool {
		return naturalLessStr(result.Operations[i].OldName, result.Operations[j].OldName)
	})

	return result
}

// BuildPlanFromBatch строит план пакетной обработки
func (a *App) BuildPlanFromBatch(targetDir string, files []string, params BatchParams) PlanResult {
	result := PlanResult{
		Operations: []RenameOp{},
		Conflicts:  []Conflict{},
	}

	if targetDir == "" || (params.Find == "" && params.Prefix == "" && params.Suffix == "" &&
		params.RemoveFromStart == 0 && params.RemoveFromEnd == 0 && !params.Numbering) {
		return result
	}

	type candidate struct {
		oldName string
		oldPath string
		newPath string
		newName string
	}

	var candidates []candidate
	oldPaths := make(map[string]struct{})

	// Validate number format
	numberPadding := 0
	if params.Numbering && params.NumberFormat != "" {
		numberPadding = len(params.NumberFormat)
		// Check if format is valid (only zeros)
		for _, ch := range params.NumberFormat {
			if ch != '0' {
				numberPadding = 3 // default to 3 if invalid
				break
			}
		}
	}

	currentNumber := params.NumberStart

	for _, fileName := range files {
		newName := fileName

		// Применяем замену
		if params.Find != "" {
			newName = strings.ReplaceAll(newName, params.Find, params.Replace)
		}

		// Разделяем имя и расширение
		ext := filepath.Ext(newName)
		base := strings.TrimSuffix(newName, ext)

		// Удаляем символы с начала
		if params.RemoveFromStart > 0 {
			runes := []rune(base)
			if params.RemoveFromStart < len(runes) {
				base = string(runes[params.RemoveFromStart:])
			} else {
				base = ""
			}
		}

		// Удаляем символы с конца
		if params.RemoveFromEnd > 0 {
			runes := []rune(base)
			if params.RemoveFromEnd < len(runes) {
				base = string(runes[:len(runes)-params.RemoveFromEnd])
			} else {
				base = ""
			}
		}

		// Добавляем нумерацию
		if params.Numbering {
			numberStr := fmt.Sprintf("%0*d", numberPadding, currentNumber)
			currentNumber++

			if params.NumberPosition == "prefix" {
				base = numberStr + "_" + base
			} else {
				base = base + "_" + numberStr
			}
		}

		// Добавляем префикс и суффикс
		base = params.Prefix + base + params.Suffix
		newName = base + ext

		if newName == fileName {
			continue // Имя не изменилось
		}

		// Проверка на пустое имя
		if base == "" {
			continue
		}

		oldPath := filepath.Join(targetDir, fileName)
		newPath := filepath.Join(targetDir, newName)
		oldPaths[normalizePathForFS(oldPath)] = struct{}{}

		candidates = append(candidates, candidate{
			oldName: fileName,
			oldPath: oldPath,
			newPath: newPath,
			newName: newName,
		})
	}

	// Проверяем конфликты
	invalid := make(map[string]string)
	seenNew := make(map[string]string)

	for _, c := range candidates {
		normNew := normalizePathForFS(c.newPath)
		if prevName, exists := seenNew[normNew]; exists && normNew != normalizePathForFS(c.oldPath) {
			invalid[c.oldName] = fmt.Sprintf("конфликт нового имени с «%s»", prevName)
		} else {
			seenNew[normNew] = c.oldName
		}
	}

	// Валидируем
	for _, c := range candidates {
		if reason, bad := invalid[c.oldName]; bad {
			result.Conflicts = append(result.Conflicts, Conflict{
				TargetName: c.oldName,
				SourceName: "[Пакетная обработка]",
				NewName:    c.newName,
				Reason:     reason,
			})
			continue
		}

		if samePathRelaxed(c.oldPath, c.newPath) {
			result.Conflicts = append(result.Conflicts, Conflict{
				TargetName: c.oldName,
				SourceName: "[Пакетная обработка]",
				NewName:    c.newName,
				Reason:     "исходное и новое имя совпадают",
			})
			continue
		}

		if fi, err := os.Stat(c.newPath); err == nil && fi.Mode().IsRegular() {
			if _, willBeRenamed := oldPaths[normalizePathForFS(c.newPath)]; !willBeRenamed {
				result.Conflicts = append(result.Conflicts, Conflict{
					TargetName: c.oldName,
					SourceName: "[Пакетная обработка]",
					NewName:    c.newName,
					Reason:     "в целевой папке уже есть файл с таким именем",
				})
				continue
			}
		}

		result.Operations = append(result.Operations, RenameOp{
			OldPath: c.oldPath,
			NewPath: c.newPath,
			OldName: c.oldName,
			NewName: c.newName,
		})
	}

	sort.Slice(result.Operations, func(i, j int) bool {
		return naturalLessStr(result.Operations[i].OldName, result.Operations[j].OldName)
	})

	return result
}

// ============ Выполнение переименования ============

func (a *App) ExecuteRename(operations []RenameOp) ExecuteResult {
	if len(operations) == 0 {
		return ExecuteResult{Success: 0, Errors: []string{}}
	}

	suffix := fmt.Sprintf(".~renametmp~%d", time.Now().UnixNano())

	type step struct {
		tmp  string
		old  string
		newp string
	}

	var steps []step
	var errors []string

	// Фаза 1: переименовываем во временные имена
	for _, op := range operations {
		tmp := op.OldPath + suffix
		for i := 0; pathExists(tmp); i++ {
			tmp = fmt.Sprintf("%s%s%d", op.OldPath, suffix, i)
		}

		if err := os.Rename(op.OldPath, tmp); err != nil {
			// Откатываем все предыдущие операции
			for i := len(steps) - 1; i >= 0; i-- {
				_ = os.Rename(steps[i].tmp, steps[i].old)
			}
			return ExecuteResult{
				Success: 0,
				Errors:  []string{fmt.Sprintf("Ошибка на этапе 1: %s → %s: %v", op.OldPath, tmp, err)},
			}
		}

		steps = append(steps, step{tmp: tmp, old: op.OldPath, newp: op.NewPath})
	}

	// Фаза 2: переименовываем в финальные имена
	success := 0
	for _, st := range steps {
		if err := os.Rename(st.tmp, st.newp); err != nil {
			_ = os.Rename(st.tmp, st.old) // Пытаемся откатить
			errors = append(errors, fmt.Sprintf("Ошибка на этапе 2: %s → %s: %v", st.tmp, st.newp, err))
		} else {
			success++
		}
	}

	return ExecuteResult{Success: success, Errors: errors}
}

// ============ Утилиты ============

func computeNewName(targetName, sourceName string) string {
	targetExt := filepath.Ext(targetName)
	sourceExt := filepath.Ext(sourceName)
	newBase := strings.TrimSuffix(sourceName, sourceExt)
	return newBase + targetExt
}

func pathExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func isCaseInsensitiveFS() bool {
	return goruntime.GOOS == "windows" || goruntime.GOOS == "darwin"
}

func normalizePathForFS(p string) string {
	p = filepath.Clean(p)
	if isCaseInsensitiveFS() {
		return strings.ToLower(p)
	}
	return p
}

func samePathRelaxed(a, b string) bool {
	a, b = filepath.Clean(a), filepath.Clean(b)
	if a == b {
		return true
	}
	if isCaseInsensitiveFS() {
		return strings.EqualFold(a, b)
	}
	return false
}

// Естественная сортировка
func naturalSort(files []FileInfo) {
	sort.SliceStable(files, func(i, j int) bool {
		return naturalLessStr(files[i].Name, files[j].Name)
	})
}

func naturalLessStr(a, b string) bool {
	ai, bi, la, lb := 0, 0, len(a), len(b)
	for ai < la && bi < lb {
		ra, rb := a[ai], b[bi]
		isDigitA, isDigitB := ra >= '0' && ra <= '9', rb >= '0' && rb <= '9'

		if isDigitA && isDigitB {
			startA, startB := ai, bi
			for ai < la && a[ai] >= '0' && a[ai] <= '9' {
				ai++
			}
			for bi < lb && b[bi] >= '0' && b[bi] <= '9' {
				bi++
			}

			numA := strings.TrimLeft(a[startA:ai], "0")
			numB := strings.TrimLeft(b[startB:bi], "0")

			if len(numA) != len(numB) {
				return len(numA) < len(numB)
			}
			if numA != numB {
				return numA < numB
			}

			lenA, lenB := ai-startA, bi-startB
			if lenA != lenB {
				return lenA < lenB
			}
			continue
		}

		raLower, rbLower := toLowerByte(ra), toLowerByte(rb)
		if raLower != rbLower {
			return raLower < rbLower
		}
		ai++
		bi++
	}
	return la < lb
}

func toLowerByte(b byte) byte {
	if b >= 'A' && b <= 'Z' {
		return b + 32
	}
	return b
}
