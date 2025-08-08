export function processArray(items) {
    let results = [];
    for (var i = 0; i < items.length; i++) {
        if (items[i] != null) {
            results.push(items[i].toString().toUpperCase());
        }
    }
    return results;
}

export function calculateTotal(prices) {
    let total = 0;
    prices.forEach(price => {
        total += price; // No validation
    });
    return total;
}

export function applyTax(amount) {
    return amount * 1.08; // 8% tax hardcoded
}
