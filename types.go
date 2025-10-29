package main

// FileInfo представляет информацию о файле для фронтенда
type FileInfo struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// RenameOp - одна операция переименования
type RenameOp struct {
	OldPath    string `json:"oldPath"`
	NewPath    string `json:"newPath"`
	OldName    string `json:"oldName"`
	NewName    string `json:"newName"`
	SourceName string `json:"sourceName,omitempty"`
}

// Conflict - описание конфликта
type Conflict struct {
	TargetName string `json:"targetName"`
	SourceName string `json:"sourceName"`
	NewName    string `json:"newName"`
	Reason     string `json:"reason"`
}

// PlanResult - результат построения плана
type PlanResult struct {
	Operations []RenameOp `json:"operations"`
	Conflicts  []Conflict `json:"conflicts"`
}

// BatchParams - параметры пакетной обработки
type BatchParams struct {
	Find            string `json:"find"`
	Replace         string `json:"replace"`
	Prefix          string `json:"prefix"`
	Suffix          string `json:"suffix"`
	RemoveFromStart int    `json:"removeFromStart"`
	RemoveFromEnd   int    `json:"removeFromEnd"`
	Numbering       bool   `json:"numbering"`
	NumberPosition  string `json:"numberPosition"` // "prefix" or "suffix"
	NumberFormat    string `json:"numberFormat"`   // "0", "00", "000", etc.
	NumberStart     int    `json:"numberStart"`
	NumberSeparator string `json:"numberSeparator"` // разделитель для нумерации
}

// ExecuteResult - результат выполнения
type ExecuteResult struct {
	Success int      `json:"success"`
	Errors  []string `json:"errors"`
}
