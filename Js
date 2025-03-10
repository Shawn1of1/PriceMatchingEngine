class PriceComparator {
    constructor() {
        this.productRegistry = new Map();
        this.similarityThreshold = 0.85;
    }

    async addProduct(product) {
        const key = this._createCompositeKey(product);
        const existing = this.productRegistry.get(key);

        if (existing) {
            return this._updateExistingProduct(existing, product);
        }

        const similar = await this._findSimilarProducts(product);
        if (similar) {
            return this._handleSimilarProduct(similar, product);
        }

        this._registerNewProduct(product);
    }

    _createCompositeKey(product) {
        return [
            product.sku,
            product.ean,
            this._normalizeName(product.title)
        ].join('|');
    }

    _normalizeName(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 50);
    }

    async _findSimilarProducts(newProduct) {
        for (const [key, existing] of this.productRegistry) {
            const similarity = await this._calculateSimilarity(
                existing.normalizedTitle,
                this._normalizeName(newProduct.title)
            );
            
            if (similarity >= this.similarityThreshold &&
                existing.brand === newProduct.brand &&
                existing.category === newProduct.category) {
                return existing;
            }
        }
        return null;
    }

    async _calculateSimilarity(a, b) {
        const { default: similarity } = await import('string-similarity');
        return similarity.compareTwoStrings(a, b);
    }

    _updateExistingProduct(existing, newProduct) {
        // Price history tracking
        const priceEntry = {
            price: newProduct.price,
            date: new Date(),
            retailer: newProduct.retailer
        };

        existing.priceHistory.push(priceEntry);
        
        // Update best price
        if (newProduct.price < existing.bestPrice) {
            existing.bestPrice = newProduct.price;
            existing.bestRetailer = newProduct.retailer;
        }

        this.productRegistry.set(this._createCompositeKey(existing), existing);
        return existing;
    }

    getComparisonResults() {
        return Array.from(this.productRegistry.values()).map(product => ({
            identifier: product.sku || product.ean,
            name: product.title,
            bestPrice: product.bestPrice,
            bestRetailer: product.bestRetailer,
            allOffers: product.priceHistory.reduce((acc, entry) => {
                if (!acc[entry.retailer] || entry.price < acc[entry.retailer].price) {
                    acc[entry.retailer] = {
                        price: entry.price,
                        lastUpdated: entry.date
                    };
                }
                return acc;
            }, {}),
            priceTrend: this._analyzePriceTrend(product.priceHistory)
        }));
    }

    _analyzePriceTrend(history) {
        // Simple moving average calculation
        const windowSize = 7;
        const trends = [];
        
        for (let i = 0; i < history.length; i++) {
            const start = Math.max(0, i - windowSize);
            const subset = history.slice(start, i + 1);
            const average = subset.reduce((sum, p) => sum + p.price, 0) / subset.length;
            trends.push(average);
        }
        
        return {
            current: history[history.length - 1].price,
            average: trends[trends.length - 1],
            direction: trends[trends.length - 1] > trends[0] ? 'up' : 'down'
        };
    }
}
