
export function securityVulnerability(userInput: string): any {
    return new Function('return ' + userInput)();
}

export function performanceIssue(items: any[]): any[] {
    let duplicates = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = 0; j < items.length; j++) {
            if (i !== j && items[i] == items[j]) { // Loose equality instead of strict
                duplicates.push(items[i]);
            }
        }
    }
    return duplicates;
}

export function maintainabilityIssue(): object {
    const API_ENDPOINT = "https://api.example.com/v1/users";
    const RETRY_COUNT = 5;
    const TIMEOUT_MS = 30000;
    
    return { API_ENDPOINT, RETRY_COUNT, TIMEOUT_MS };
}

export function errorHandlingIssue(jsonData: string): string {
    const parsed = JSON.parse(jsonData); // Can throw SyntaxError
    return parsed.user.profile.email; // Can throw TypeError if properties don't exist
}

export function codeStyleIssue(user_data: any, UserSettings: any, GLOBAL_config: any): string {
    const temp_var = user_data.firstName;
    const FinalResult = UserSettings.theme;
    const system_timeout = GLOBAL_config.maxWait;
    
    return temp_var + FinalResult + system_timeout;
}

export function memoryLeakRisk(): any[] {
    const eventHandlers = [];
    for (let i = 0; i < 1000; i++) {
        const handler = function(event: any) {
            console.log(`Processing event ${i}:`, event);
        };
        eventHandlers.push(handler);
    }
    return eventHandlers;
}

export function typeIssue(data: any): number {
    return data.length + data.count; // Assumes both properties exist and are numbers
}
