import express from "express";
import { createServer as createViteServer } from "vite";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const app = express();
const PORT = 3000;

app.use(express.json());

function calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calculateSMA(data: number[], period: number): number[] {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(0);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j];
            }
            sma.push(sum / period);
        }
    }
    return sma;
}

function calculateRSI(data: number[], period: number): number[] {
    const rsi = new Array(data.length).fill(0);
    if (data.length < period + 1) return rsi;

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) {
            avgGain += change;
        } else {
            avgLoss -= change;
        }
    }
    avgGain /= period;
    avgLoss /= period;

    if (avgLoss === 0) {
        rsi[period] = 100;
    } else {
        const rs = avgGain / avgLoss;
        rsi[period] = 100 - (100 / (1 + rs));
    }

    for (let i = period + 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        let gain = 0;
        let loss = 0;
        if (change > 0) {
            gain = change;
        } else {
            loss = -change;
        }

        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;

        if (avgLoss === 0) {
            rsi[i] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsi[i] = 100 - (100 / (1 + rs));
        }
    }

    return rsi;
}

async function analyzeTicker(symbol: string, timeframe: string, earningsDate?: Date) {
    const intervalMap: Record<string, "1m"|"2m"|"5m"|"15m"|"60m"> = {
        '1m': '1m', '2m': '2m', '5m': '5m', '15m': '15m', '1h': '60m'
    };
    const interval = intervalMap[timeframe] || '5m';
    
    // 5 days ago
    const period1 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const result = await yahooFinance.chart(symbol, { period1, interval });
    
    const quotes = result.quotes.filter(q => q.close !== null && q.volume !== null);
    if (quotes.length < 50) return null;
    
    const closes = quotes.map(q => q.close!);
    const volumes = quotes.map(q => q.volume!);
    const highs = quotes.map(q => q.high!);
    const lows = quotes.map(q => q.low!);
    const dates = quotes.map(q => q.date);
    
    const ema9 = calculateEMA(closes, 9);
    const ema20 = calculateEMA(closes, 20);
    const ema200 = calculateEMA(closes, 200);
    
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const macdSignal = calculateEMA(macdLine, 9);
    
    let cumVol = 0;
    let cumTypPriceVol = 0;
    const vwaps = [];
    for (let i = 0; i < quotes.length; i++) {
        const tp = (highs[i] + lows[i] + closes[i]) / 3;
        cumVol += volumes[i];
        cumTypPriceVol += tp * volumes[i];
        vwaps.push(cumTypPriceVol / cumVol);
    }
    
    const volSma20 = calculateSMA(volumes, 20);
    const rsi14 = calculateRSI(closes, 14);
    
    const currentIdx = quotes.length - 1;
    const price = closes[currentIdx];
    const currentEma9 = ema9[currentIdx];
    const currentEma20 = ema20[currentIdx];
    const currentEma200 = ema200[currentIdx];
    const currentMacdLine = macdLine[currentIdx];
    const currentMacdSignal = macdSignal[currentIdx];
    const currentVwap = vwaps[currentIdx];
    const currentVolSma20 = volSma20[currentIdx];
    const currentVolume = volumes[currentIdx];
    const currentRsi = rsi14[currentIdx];
    
    const currentDate = dates[currentIdx];
    const currentDayStr = currentDate.toISOString().split('T')[0];
    
    let prevDailyClose = price;
    for (let i = currentIdx - 1; i >= 0; i--) {
        const dStr = dates[i].toISOString().split('T')[0];
        if (dStr < currentDayStr) {
            prevDailyClose = closes[i];
            break;
        }
    }
    
    const pctChange = ((price - prevDailyClose) / prevDailyClose) * 100;
    const rvol = currentVolSma20 > 0 ? currentVolume / currentVolSma20 : 0;
    
    const emaStatus = currentEma9 > currentEma20;
    const macdStatus = currentMacdLine > currentMacdSignal;
    const trend200 = price > currentEma200;
    const trendVwap = price > currentVwap;
    
    const isMomentumGood = emaStatus && macdStatus;
    const hasVolume = rvol > 2.0;
    
    let category = 0;
    if (isMomentumGood && hasVolume) category = 2;
    else if (isMomentumGood && !hasVolume) category = 1;
    
    let earnStr = "-";
    if (earningsDate) {
        earnStr = earningsDate.toISOString().split('T')[0];
    }
    
    return {
        symbol,
        price,
        pctChange,
        rvol,
        rsi: currentRsi,
        emaStatus,
        macdStatus,
        trend200,
        trendVwap,
        earnStr,
        category
    };
}

app.get('/api/scan', async (req, res) => {
    const timeframe = req.query.timeframe as string || '5m';
    const symbolsParam = req.query.symbols as string;
    if (!symbolsParam) {
        res.status(400).json({ error: 'No symbols provided' });
        return;
    }
    const symbols = symbolsParam.split(',');
    
    let earningsMap: Record<string, Date> = {};
    try {
        // Fetch quotes in batches of 10 to avoid URL length limits or rate limits
        const batchSize = 10;
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            try {
                const quotes = await yahooFinance.quote(batch);
                for (const q of quotes) {
                    if (q.earningsTimestamp) {
                        earningsMap[q.symbol] = new Date(q.earningsTimestamp);
                    }
                }
            } catch (e) {
                console.error("Error fetching quotes batch", e);
            }
        }
    } catch (e) {
        console.error("Error fetching quotes", e);
    }
    
    const concurrency = 5;
    let index = 0;
    const results: any[] = [];
    
    const processNext = async () => {
        if (index >= symbols.length) return;
        const sym = symbols[index++];
        
        try {
            const data = await analyzeTicker(sym, timeframe, earningsMap[sym]);
            if (data) {
                results.push(data);
            }
        } catch (e) {
            console.error(`Error processing ${sym}:`, e);
        }
        
        await processNext();
    };
    
    const workers = [];
    for (let i = 0; i < concurrency && i < symbols.length; i++) {
        workers.push(processNext());
    }
    
    await Promise.all(workers);
    res.json(results);
});

async function startServer() {
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        app.use(express.static('dist'));
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
