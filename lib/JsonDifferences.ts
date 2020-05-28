export interface JsonDifferences{
    count: {
        create: number;
        delete: number;
        update: number;
    };
    diffLeft: {
        [jsonpath: string]: "child-update" | "delete" | "update" | "create";
    };    
    diffRight: {
        [jsonpath: string]: "child-update" | "delete" | "update" | "create";
    };
}