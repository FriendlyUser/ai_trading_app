import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Volume2, VolumeX } from 'lucide-react';

const WATCHLIST = [
    'AMZN', 'CRWV', 'NBIS', 'APP', 'RBRK', 'AEHR', 'AFRM', 'UPST', 'FOUR', 'LMND', 
    'OKLO', 'ENPH', 'NEE', 'VKTX', 'RKLB', 'ASTS', 'TTD', 'HUT', 'IREN', 'MSTR', 
    'LULU', 'NKE', 'CVNA', 'ROKU', 'DASH', 'BABA', 'RDDT', 'SHOP', 'LSPD', 
    'RIVN', 'FCX', 'CLF', 'FSLR', 'BTE', 'BE', 'SOFI', 'HOOD', 'TE', 'EOSE',
    'LUNR', 'ONDS', 'OSS', 'PINS', 'ACHR', 'CLS', 'WEED', 'COIN',
    'MU', 'ONTO', 'ELF', 'NET', 'DFTX', 'CRSP', 'AEM', 'ABNB', 'FSLY', 'HIMS',
    'NEGG'
];

interface StockData {
    symbol: string;
    price: number;
    pctChange: number;
    rvol: number;
    rsi: number;
    emaStatus: boolean;
    macdStatus: boolean;
    trend200: boolean;
    trendVwap: boolean;
    earnStr: string;
    category: number;
}

export default function App() {
    const [timeframe, setTimeframe] = useState('5m');
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState('Prêt...');
    const [results, setResults] = useState<StockData[]>([]);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Create a simple beep sound using Web Audio API if no audio file is provided
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            audioRef.current = {
                play: () => {
                    if (ctx.state === 'suspended') ctx.resume();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1000, ctx.currentTime);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.2);
                    return Promise.resolve();
                }
            } as any;
        }
    }, []);

    const fetchScan = async () => {
        setStatus(`Scan (${timeframe})...`);
        try {
            const symbolsParam = WATCHLIST.join(',');
            const url = `/api/scan?timeframe=${timeframe}&symbols=${symbolsParam}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const data: StockData[] = await response.json();
            
            setResults(data.sort((a, b) => b.rvol - a.rvol));
            
            const hasTop1 = data.some(r => r.category === 2);
            if (hasTop1 && soundEnabled && audioRef.current) {
                audioRef.current.play().catch(() => {});
            }
            setStatus('Scan terminé. Prochain scan dans 15s...');
        } catch (error) {
            console.error('Fetch error:', error);
            setStatus('Erreur de connexion. Nouvelle tentative dans 15s...');
        }
        
        // We need to check if it's still running before setting the next timeout
        // Because fetch is async, isRunning might have changed
        setIsRunning(currentIsRunning => {
            if (currentIsRunning) {
                timeoutRef.current = setTimeout(fetchScan, 15000);
            }
            return currentIsRunning;
        });
    };

    const startScan = () => {
        if (isRunning) return;
        setIsRunning(true);
        setResults([]);
        
        // Start immediately, then loop via timeout
        setTimeout(() => {
            fetchScan();
        }, 0);
    };

    const stopScan = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsRunning(false);
        setStatus('Arrêté.');
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const top1 = results.filter(r => r.category === 2);
    const top2 = results.filter(r => r.category === 1);
    const normal = results.filter(r => r.category === 0);

    const renderRow = (row: StockData, isHighlighted: boolean) => {
        const getEarnColor = (earnStr: string) => {
            if (earnStr === '-' || earnStr === '?') return '#444444';
            const earnDate = new Date(earnStr);
            const today = new Date();
            const diffTime = earnDate.getTime() - today.getTime();
            let delta = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const maxDays = 90;
            if (delta < 0) delta = 0;
            if (delta > maxDays) delta = maxDays;
            
            const startVal = 255;
            const endVal = 80;
            const val = Math.floor(startVal - (delta / maxDays) * (startVal - endVal));
            return `rgb(${val}, ${val}, ${val})`;
        };

        const isAllGreen = row.emaStatus && row.macdStatus && row.trend200 && row.trendVwap;
        const rowClass = isAllGreen 
            ? "border-b border-[#00ff00]/30 bg-[#00ff00]/10 hover:bg-[#00ff00]/20 transition-colors"
            : "border-b border-[#2d2d2d] hover:bg-[#252525] transition-colors";

        return (
            <tr key={row.symbol} className={rowClass}>
                <td className={`p-2 font-bold ${isHighlighted ? 'text-white' : 'text-[#999999]'}`}>
                    {row.symbol}
                </td>
                <td className="p-2 text-[#cccccc]">{row.price.toFixed(2)}</td>
                <td className={`p-2 ${row.pctChange > 0 ? 'text-[#00ff00]' : row.pctChange < 0 ? 'text-[#ff4444]' : 'text-[#cccccc]'}`}>
                    {row.pctChange > 0 ? '+' : ''}{row.pctChange.toFixed(2)}%
                </td>
                <td className={`p-2 ${row.rvol >= 2.0 ? 'text-[#FFD700] font-bold' : row.rvol >= 1.0 ? 'text-[#00ff00]' : 'text-[#ff4444]'}`}>
                    {row.rvol.toFixed(1)}x
                </td>
                <td className={`p-2 ${row.rsi >= 70 ? 'text-[#ff4444]' : row.rsi <= 30 ? 'text-[#00ff00]' : 'text-[#cccccc]'}`}>
                    {row.rsi.toFixed(1)}
                </td>
                <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${row.emaStatus ? 'bg-[#062b0e] text-[#00ff00]' : 'bg-[#2b0606] text-[#ff4444]'}`}>
                        {row.emaStatus ? '✅' : '❌'}
                    </span>
                </td>
                <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${row.macdStatus ? 'bg-[#062b0e] text-[#00ff00]' : 'bg-[#2b0606] text-[#ff4444]'}`}>
                        {row.macdStatus ? '✅' : '❌'}
                    </span>
                </td>
                <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${row.trend200 ? 'bg-[#062b0e] text-[#00ff00]' : 'bg-[#2b0606] text-[#ff4444]'}`}>
                        {row.trend200 ? '✅' : '❌'}
                    </span>
                </td>
                <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${row.trendVwap ? 'bg-[#062b0e] text-[#00ff00]' : 'bg-[#2b0606] text-[#ff4444]'}`}>
                        {row.trendVwap ? '✅' : '❌'}
                    </span>
                </td>
                <td className="p-2 font-mono text-sm" style={{ color: getEarnColor(row.earnStr) }}>
                    {row.earnStr}
                </td>
            </tr>
        );
    };

    return (
        <div className="min-h-screen bg-[#121212] text-[#cccccc] font-sans flex flex-col">
            {/* Header */}
            <div className="bg-[#2d2d2d] p-3 flex items-center justify-between shadow-md z-10">
                <div className="flex items-center space-x-4">
                    <h1 className="text-white font-bold text-lg tracking-wide">Scanner Pro Compact</h1>
                    
                    <div className="flex items-center space-x-2 ml-4">
                        <span className="font-bold text-sm">TF:</span>
                        <select 
                            value={timeframe} 
                            onChange={(e) => setTimeframe(e.target.value)}
                            disabled={isRunning}
                            className="bg-[#1e1e1e] border border-[#444] text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-[#005a9e]"
                        >
                            <option value="1m">1m</option>
                            <option value="2m">2m</option>
                            <option value="5m">5m</option>
                            <option value="15m">15m</option>
                            <option value="1h">1h</option>
                        </select>
                    </div>

                    <button 
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`flex items-center space-x-1 px-3 py-1 rounded text-sm transition-colors ${soundEnabled ? 'bg-[#1e1e1e] text-white border border-[#444]' : 'bg-[#1e1e1e] text-[#666] border border-[#333]'}`}
                    >
                        {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        <span>Son</span>
                    </button>
                </div>

                <div className="flex items-center space-x-4">
                    <span className="text-[#666666] text-sm italic">{status}</span>
                    
                    {!isRunning ? (
                        <button 
                            onClick={() => startScan()}
                            className="flex items-center space-x-1 bg-[#005a9e] hover:bg-[#0078d4] text-white px-4 py-1.5 rounded font-bold text-sm transition-colors"
                        >
                            <Play size={16} />
                            <span>START</span>
                        </button>
                    ) : (
                        <button 
                            onClick={stopScan}
                            className="flex items-center space-x-1 bg-[#ff4444] hover:bg-[#ff6666] text-white px-4 py-1.5 rounded font-bold text-sm transition-colors"
                        >
                            <Square size={16} />
                            <span>STOP</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto p-4">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#2d2d2d] shadow-sm z-10">
                        <tr>
                            <th className="p-2 text-white font-bold text-sm">Ticker</th>
                            <th className="p-2 text-white font-bold text-sm">Prix</th>
                            <th className="p-2 text-white font-bold text-sm">% Jour</th>
                            <th className="p-2 text-white font-bold text-sm">RVol</th>
                            <th className="p-2 text-white font-bold text-sm">RSI</th>
                            <th className="p-2 text-white font-bold text-sm">EMA 9/20</th>
                            <th className="p-2 text-white font-bold text-sm">MACD</th>
                            <th className="p-2 text-white font-bold text-sm">EMA 200</th>
                            <th className="p-2 text-white font-bold text-sm">VWAP</th>
                            <th className="p-2 text-white font-bold text-sm">Earn</th>
                        </tr>
                    </thead>
                    <tbody className="bg-[#1e1e1e]">
                        {top1.map(r => renderRow(r, true))}
                        
                        {top1.length > 0 && (top2.length > 0 || normal.length > 0) && (
                            <tr><td colSpan={10} className="h-1 bg-[#555555]"></td></tr>
                        )}
                        
                        {top2.map(r => renderRow(r, true))}
                        
                        {top2.length > 0 && normal.length > 0 && (
                            <tr><td colSpan={10} className="h-1 bg-[#555555]"></td></tr>
                        )}
                        
                        {normal.map(r => renderRow(r, false))}

                        {results.length === 0 && !isRunning && (
                            <tr>
                                <td colSpan={10} className="p-8 text-center text-[#666]">
                                    Cliquez sur START pour lancer le scan.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
