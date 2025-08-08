export function calculateSum(a: number, b: number): number {
    const result = a + b;
    return result;
}

export function processUserData(userInput: string): string {
    const processed = userInput.trim().toLowerCase();
    return processed;
}

export function findDuplicates(items: any[]): any[] {
    const result = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            if (items[i] === items[j]) {
                result.push(items[i]);
            }
        }
    }
    return result;
}

export function formatData(data: any): string {
    return JSON.stringify(data);
}

export function calculateDiscount(price: number): number {
    if (price > 100) {
        return price * 0.9; // 10% discount
    }
    return price * 0.95; // 5% discount
}
