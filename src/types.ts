namespace Types {
    export type ActionType = "click" | "input" | "select" | "change" | "submit" | 
                           "keydown" | "keyup" | "keypress" | "label" | 
                           "tableLoop" | "tablePaginationNext";

    export interface Action {
        type: ActionType;
        selector: string;
        value?: string;
        label?: string;
        timestamp: number;
    }

    export interface TableLoopAction extends Action {
        type: "tableLoop" | "tablePaginationNext";
        tableSelector?: string;
        nextSelector?: string;
    }

    export interface StorageData {
        actions: Action[];
        isRecording: boolean;
    }

    export interface MessageCommand {
        command: "start" | "stop" | "getActions";
    }

    export interface StorageChange {
        oldValue?: any;
        newValue?: any;
    }

    export interface StorageChanges {
        [key: string]: chrome.storage.StorageChange;
    }

    export interface Message {
        type: string;
    }

    export interface RecordingStateResponse {
        isRecording: boolean;
    }
}