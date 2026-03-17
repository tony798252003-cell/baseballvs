import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Users, Settings, Volume2, VolumeX, Activity, Trophy, XCircle, Info } from 'lucide-react';

// 預設模擬資料
const DEMO_DATA = `姓名,背號,球隊,照片,加油歌
大谷翔平,17,道奇,https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Shohei_Ohtani_2024.jpg/440px-Shohei_Ohtani_2024.jpg,https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3
林智勝,31,味全,https://img.ltn.com.tw/Upload/sports/page/800/2023/04/16/phpdG8aVq.jpg,https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3
陳晨威,98,樂天,,
江坤宇,90,兄弟,,`;

// === 子元件區 (拆分出來以確保穩定渲染) ===

const Notification = ({ notification }) => {
  if (!notification) return null;
  return (
    <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 transition-all ${notification.type === 'alert' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'}`}>
      {notification.type === 'alert' ? <XCircle size={24} /> : <Info size={24} />}
      <span className="text-lg font-bold">{notification.text}</span>
    </div>
  );
};

const Field = ({ runners }) => (
  <div className="relative w-48 h-48 mx-auto my-4 transform rotate-45 border-4 border-white bg-green-600 rounded-lg shadow-xl select-none">
    {/* 1壘 */}
    <div className={`absolute top-0 right-0 w-8 h-8 -mt-1 -mr-1 transition-all duration-300 ${runners[0] ? 'bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)] scale-110' : 'bg-white'}`}></div>
    {/* 2壘 */}
    <div className={`absolute top-0 left-0 w-8 h-8 -mt-1 -ml-1 transition-all duration-300 ${runners[1] ? 'bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)] scale-110' : 'bg-white'}`}></div>
    {/* 3壘 */}
    <div className={`absolute bottom-0 left-0 w-8 h-8 -mb-1 -ml-1 transition-all duration-300 ${runners[2] ? 'bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)] scale-110' : 'bg-white'}`}></div>
    {/* 本壘 */}
    <div className="absolute bottom-0 right-0 w-8 h-8 -mb-1 -mr-1 bg-white rounded-tl-full"></div>
  </div>
);

const ScoreBoard = ({ score, gameType, isTop, inning, outs }) => (
  <div className="bg-slate-800 text-white p-3 rounded-xl flex justify-between items-center shadow-lg mb-4 select-none">
    <div className="text-center w-1/3">
      <div className="text-xs text-slate-400">GUEST</div>
      <div className="text-3xl font-bold font-mono text-yellow-400">{score.away}</div>
    </div>
    <div className="text-center w-1/3 border-x border-slate-600">
      <div className="text-xs text-slate-400">INNING</div>
      <div className="text-xl font-bold">
        {gameType === 'versus' ? (isTop ? '▲' : '▼') : ''} {inning}
      </div>
      <div className="flex justify-center gap-1 mt-1">
        {[...Array(2)].map((_, i) => (
          <div key={i} className={`w-3 h-3 rounded-full transition-colors ${i < outs ? 'bg-red-500' : 'bg-slate-600'}`}></div>
        ))}
      </div>
      <div className="text-xs text-red-400 mt-1">{outs} OUT</div>
    </div>
    <div className="text-center w-1/3">
      <div className="text-xs text-slate-400">HOME</div>
      <div className="text-3xl font-bold font-mono">{score.home}</div>
    </div>
  </div>
);

const BatterCard = ({ player }) => {
  if (!player) return null;
  return (
    <div className="bg-white rounded-xl p-4 shadow-lg mb-4 flex items-center gap-4 relative overflow-hidden select-none">
      <div className="absolute top-0 right-0 w-24 h-full bg-blue-50 transform skew-x-12 translate-x-8 z-0"></div>
      <div className="relative z-10 w-20 h-20 flex-shrink-0">
          {player.photo ? (
               <img src={player.photo} alt={player.name} className="w-20 h-20 rounded-full object-cover border-4 border-slate-200 bg-slate-200" />
          ) : (
              <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                  <Users size={32} />
              </div>
          )}
      </div>
      <div className="relative z-10 flex-1">
        <div className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full inline-block mb-1">
          {player.team} #{player.number}
        </div>
        <h2 className="text-2xl font-black text-slate-800">{player.name}</h2>
        <div className="flex items-center gap-2 mt-1">
           {player.song && (
               <div className="text-xs text-green-600 flex items-center gap-1">
                   <Volume2 size={12} /> 加油歌 Ready
               </div>
           )}
        </div>
      </div>
    </div>
  );
};

// === 主程式 ===

export default function App() {
  // === 狀態管理 ===
  const [mode, setMode] = useState('setup'); // setup, game
  const [gameType, setGameType] = useState('single'); // single, versus
  
  // 球員名單
  const [roster, setRoster] = useState([]);
  const [lineup, setLineup] = useState([]);
  const [csvInput, setCsvInput] = useState(DEMO_DATA);

  // 比賽數據
  const [currentBatterIndex, setCurrentBatterIndex] = useState(0);
  const [score, setScore] = useState({ away: 0, home: 0 });
  const [inning, setInning] = useState(1);
  const [isTop, setIsTop] = useState(true);
  const [outs, setOuts] = useState(0);
  const [runners, setRunners] = useState([false, false, false]); // [一壘, 二壘, 三壘]
  
  // 記球數
  const [showPitchCount, setShowPitchCount] = useState(false);
  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);

  // 系統狀態
  const [notification, setNotification] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);

  // === 初始化 ===
  useEffect(() => {
    parseCSV(csvInput);
  }, []);

  const parseCSV = (text) => {
    try {
      const lines = text.trim().split('\n');
      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        return {
          name: values[0]?.trim() || '未命名',
          number: values[1]?.trim() || '00',
          team: values[2]?.trim() || '自由球員',
          photo: values[3]?.trim() || '',
          song: values[4]?.trim() || ''
        };
      });
      setRoster(data);
      setLineup(data.map((_, i) => i));
    } catch (e) {
      console.error("CSV 解析錯誤", e);
    }
  };

  const showToast = (text, type = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // === 音效控制 ===
  useEffect(() => {
    if (mode === 'game' && audioRef.current && !isMuted) {
      const player = roster[lineup[currentBatterIndex]];
      if (player && player.song) {
        audioRef.current.src = player.song;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.log("Auto-play prevented:", error);
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [currentBatterIndex, mode, isMuted, lineup, roster]);

  // === 棒球邏輯 ===
  const nextBatter = () => {
    setBalls(0);
    setStrikes(0);
    setCurrentBatterIndex((prev) => (prev + 1) % lineup.length);
  };

  const handleHit = (bases) => {
    let runs = 0;
    let newRunners = [...runners];

    if (bases === 4) { // 全壘打
      runs = newRunners.filter(r => r).length + 1;
      newRunners = [false, false, false];
      showToast(`全壘打！帶有 ${runs} 分打點！`, 'alert');
    } else {
      // 推進
      if (newRunners[2]) { runs++; newRunners[2] = false; }
      if (newRunners[1]) {
        if (bases >= 2) { runs++; newRunners[1] = false; }
        else { newRunners[2] = true; newRunners[1] = false; }
      }
      if (newRunners[0]) {
        if (bases >= 3) { runs++; newRunners[0] = false; }
        else if (bases === 2) { newRunners[2] = true; newRunners[0] = false; }
        else { newRunners[1] = true; newRunners[0] = false; }
      }
      if (bases === 1) newRunners[0] = true;
      if (bases === 2) newRunners[1] = true;
      if (bases === 3) newRunners[2] = true;

      const hitNames = ['一安', '二安', '三安'];
      if (runs > 0) showToast(`${hitNames[bases-1]}！得了 ${runs} 分！`);
    }

    setRunners(newRunners);
    addScore(runs);
    nextBatter();
  };

  const handleWalk = () => {
    let newRunners = [...runners];
    let runs = 0;
    if (newRunners[0]) {
      if (newRunners[1]) {
        if (newRunners[2]) { runs = 1; }
        newRunners[2] = true;
      }
      newRunners[1] = true;
    }
    newRunners[0] = true;
    setRunners(newRunners);
    if (runs > 0) showToast("滿壘保送擠回一分！");
    addScore(runs);
    nextBatter();
  };

  const handleOut = () => {
    const newOuts = outs + 1;
    setBalls(0);
    setStrikes(0);

    if (newOuts >= 3) {
      if (gameType === 'versus') {
        showToast("三人出局！攻守交換", 'alert');
        if (!isTop) setInning(i => i + 1);
        setIsTop(!isTop);
      } else {
        showToast("三人出局！清除壘包", 'alert');
      }
      setOuts(0);
      setRunners([false, false, false]);
      nextBatter();
    } else {
      setOuts(newOuts);
      showToast("出局！");
      nextBatter();
    }
  };

  const addScore = (runs) => {
    if (runs === 0) return;
    setScore(prev => {
      if (gameType === 'versus') {
        return isTop ? { ...prev, away: prev.away + runs } : { ...prev, home: prev.home + runs };
      } else {
        return { ...prev, away: prev.away + runs };
      }
    });
  };

  const addBall = () => {
    if (balls + 1 === 4) {
      showToast("四壞球保送！");
      handleWalk();
    } else {
      setBalls(balls + 1);
    }
  };

  const addStrike = () => {
    if (strikes + 1 === 3) {
      showToast("三振出局！", 'alert');
      handleOut();
    } else {
      setStrikes(strikes + 1);
    }
  };

  // === 畫面渲染 ===
  if (mode === 'setup') {
    return (
      <div className="min-h-screen bg-slate-100 p-4 font-sans flex flex-col items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-blue-600 p-6 text-white text-center">
            <h1 className="text-3xl font-bold mb-2">⚾ 棒球對決</h1>
            <p className="opacity-90">設定您的球員與賽制</p>
          </div>
          
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">比賽模式</label>
              <div className="flex gap-2">
                <button onClick={() => setGameType('single')} className={`flex-1 py-3 rounded-lg font-bold transition-all ${gameType === 'single' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-slate-100 text-slate-500'}`}>
                  單人無限打擊
                </button>
                <button onClick={() => setGameType('versus')} className={`flex-1 py-3 rounded-lg font-bold transition-all ${gameType === 'versus' ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-slate-100 text-slate-500'}`}>
                  雙人攻守交換
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">匯入球員名單 (CSV)</label>
              <textarea 
                className="w-full h-32 p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={csvInput}
                onChange={(e) => { setCsvInput(e.target.value); parseCSV(e.target.value); }}
                placeholder="貼上 Excel/Google Sheet 的內容..."
              />
            </div>

            <button onClick={() => setMode('game')} className="w-full bg-green-500 hover:bg-green-600 text-white text-xl font-bold py-4 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
              <Play size={24} fill="currentColor" /> 開始比賽
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-2 sm:p-4 font-sans pb-24 touch-manipulation">
      <div className="max-w-md mx-auto">
        <Notification notification={notification} />
        
        <div className="flex justify-between items-center mb-4">
            <button onClick={() => setMode('setup')} className="p-2 bg-white rounded-full shadow text-slate-600"><Settings size={20} /></button>
            <div className="text-slate-800 font-bold">{gameType === 'single' ? '無限暢打模式' : '雙人對戰模式'}</div>
            <button onClick={() => setIsMuted(!isMuted)} className="p-2 bg-white rounded-full shadow text-slate-600">
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
        </div>

        <ScoreBoard score={score} gameType={gameType} isTop={isTop} inning={inning} outs={outs} />

        <div className="relative">
             <Field runners={runners} />
             <button onClick={() => setShowPitchCount(!showPitchCount)} className="absolute top-0 left-0 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-slate-600 shadow border border-slate-200 flex items-center gap-1">
                <Activity size={12} /> 記球數
             </button>
        </div>

        {showPitchCount && (
            <div className="bg-slate-800 p-3 rounded-lg mb-4 flex items-center justify-between text-white animate-pulse">
                <div className="flex gap-4 px-2">
                    <div className="text-center"><div className="text-xs text-slate-400">BALL</div><div className="text-xl font-bold text-green-400">{balls}</div></div>
                    <div className="text-center"><div className="text-xs text-slate-400">STRIKE</div><div className="text-xl font-bold text-yellow-400">{strikes}</div></div>
                </div>
                <div className="flex gap-2">
                    <button onClick={addBall} className="px-4 py-2 bg-green-600 rounded font-bold hover:bg-green-500 active:scale-95">壞球</button>
                    <button onClick={addStrike} className="px-4 py-2 bg-yellow-600 rounded font-bold hover:bg-yellow-500 active:scale-95">好球</button>
                    <button onClick={() => {setBalls(0); setStrikes(0)}} className="p-2 bg-slate-600 rounded text-slate-300"><RotateCcw size={16}/></button>
                </div>
            </div>
        )}

        <BatterCard player={roster[lineup[currentBatterIndex]]} />
        <audio ref={audioRef} className="hidden" />

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button onClick={() => handleHit(1)} className="col-span-1 bg-blue-500 text-white p-4 rounded-xl font-bold text-lg shadow-[0_4px_0_rgb(29,78,216)] active:shadow-none active:translate-y-[4px] transition-all">一安</button>
            <button onClick={() => handleHit(2)} className="col-span-1 bg-blue-600 text-white p-4 rounded-xl font-bold text-lg shadow-[0_4px_0_rgb(30,64,175)] active:shadow-none active:translate-y-[4px] transition-all">二安</button>
            <button onClick={() => handleHit(3)} className="col-span-1 bg-blue-700 text-white p-4 rounded-xl font-bold text-lg shadow-[0_4px_0_rgb(29,78,216)] active:shadow-none active:translate-y-[4px] transition-all">三安</button>
            <button onClick={() => handleOut()} className="col-span-1 bg-red-500 text-white p-4 rounded-xl font-bold text-lg shadow-[0_4px_0_rgb(185,28,28)] active:shadow-none active:translate-y-[4px] transition-all">出局</button>
            <button onClick={() => handleWalk()} className="col-span-1 bg-purple-500 text-white p-4 rounded-xl font-bold text-lg shadow-[0_4px_0_rgb(126,34,206)] active:shadow-none active:translate-y-[4px] transition-all">保送</button>
             <button onClick={() => handleHit(4)} className="col-span-1 bg-orange-500 text-white p-4 rounded-xl font-bold text-lg shadow-[0_4px_0_rgb(194,65,12)] active:shadow-none active:translate-y-[4px] transition-all flex flex-col items-center justify-center leading-none">
                <span>全壘打</span>
                <Trophy size={16} className="mt-1 opacity-80"/>
            </button>
        </div>
      </div>
    </div>
  );
}
