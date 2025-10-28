export namespace main {
	
	export class BatchParams {
	    find: string;
	    replace: string;
	    prefix: string;
	    suffix: string;
	    removeFromStart: number;
	    removeFromEnd: number;
	    numbering: boolean;
	    numberPosition: string;
	    numberFormat: string;
	    numberStart: number;
	
	    static createFrom(source: any = {}) {
	        return new BatchParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.find = source["find"];
	        this.replace = source["replace"];
	        this.prefix = source["prefix"];
	        this.suffix = source["suffix"];
	        this.removeFromStart = source["removeFromStart"];
	        this.removeFromEnd = source["removeFromEnd"];
	        this.numbering = source["numbering"];
	        this.numberPosition = source["numberPosition"];
	        this.numberFormat = source["numberFormat"];
	        this.numberStart = source["numberStart"];
	    }
	}
	export class Conflict {
	    targetName: string;
	    sourceName: string;
	    newName: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new Conflict(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetName = source["targetName"];
	        this.sourceName = source["sourceName"];
	        this.newName = source["newName"];
	        this.reason = source["reason"];
	    }
	}
	export class ExecuteResult {
	    success: number;
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new ExecuteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.errors = source["errors"];
	    }
	}
	export class FileInfo {
	    name: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new FileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	    }
	}
	export class RenameOp {
	    oldPath: string;
	    newPath: string;
	    oldName: string;
	    newName: string;
	    sourceName?: string;
	
	    static createFrom(source: any = {}) {
	        return new RenameOp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.oldPath = source["oldPath"];
	        this.newPath = source["newPath"];
	        this.oldName = source["oldName"];
	        this.newName = source["newName"];
	        this.sourceName = source["sourceName"];
	    }
	}
	export class PlanResult {
	    operations: RenameOp[];
	    conflicts: Conflict[];
	
	    static createFrom(source: any = {}) {
	        return new PlanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.operations = this.convertValues(source["operations"], RenameOp);
	        this.conflicts = this.convertValues(source["conflicts"], Conflict);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

