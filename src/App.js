import { useState, useEffect, useRef } from "react";

const PLAYER_COLORS = [
  "#E74C3C","#3498DB","#2ECC71","#9B59B6","#F1C40F",
  "#1ABC9C","#E67E22","#B8860B","#D35400","#7F8C8D",
  "#C0392B","#2980B9","#27AE60","#8E44AD","#F39C12"
];

// ─── Pure Logic ───────────────────────────────────────────────────────────────

function recalcStats(player) {
  let points = 0, gamePoints = 0, gamesPlayed = 0, opponents = [];
  for (const m of (player.matches || [])) {
    if (m.draw) points += 1;
    else if (m.wins > m.losses) points += 3;
    gamePoints += m.wins * 3;
    gamesPlayed += m.wins + m.losses;
    if (m.opponent !== -1) opponents.push(m.opponent);
  }
  return { ...player, points, gamePoints, gamesPlayed, opponents };
}

function getMatchWinPct(player) {
  if (!player.matches.length) return 0.33;
  let total = 0;
  for (const m of player.matches) {
    if (m.draw) total += 1;
    else if (m.wins > m.losses) total += 3;
  }
  return Math.max(total / (player.matches.length * 3), 0.33);
}

function getGameWinPct(player) {
  if (player.gamesPlayed === 0) return 0.33;
  return Math.max(player.gamePoints / (player.gamesPlayed * 3), 0.33);
}

function applyMatch(player, roundNum, oppId, wins, losses, draw = false) {
  const filtered = player.matches.filter(m => m.round !== roundNum);
  return recalcStats({ ...player, matches: [...filtered, { round: roundNum, opponent: oppId, wins, losses, draw }] });
}

function computeStandings(players) {
  return players.map(p => {
    let oppMwSum = 0, validOpps = 0, oppGwSum = 0;
    for (const oppId of p.opponents) {
      const opp = players.find(x => x.id === oppId);
      if (opp) { oppMwSum += getMatchWinPct(opp); oppGwSum += getGameWinPct(opp); validOpps++; }
    }
    const omw = validOpps > 0 ? oppMwSum / validOpps : 0.33;
    const ogw = validOpps > 0 ? oppGwSum / validOpps : 0.33;
    return { player: p, points: p.points, omw, gw: getGameWinPct(p), ogw };
  }).sort((a, b) => b.points - a.points || b.omw - a.omw || b.gw - a.gw || b.ogw - a.ogw);
}

function makePairings(players) {
  const standings = computeStandings(players);
  const pool = standings.map(s => s.player).filter(p => p.active);
  const pairings = [];
  const groups = {};
  for (const p of pool) { if (!groups[p.points]) groups[p.points] = []; groups[p.points].push(p); }
  const sortedPts = Object.keys(groups).map(Number).sort((a, b) => b - a);
  for (const pt of sortedPts) groups[pt].sort(() => Math.random() - 0.5);
  let sorted = [];
  for (const pt of sortedPts) sorted.push(...groups[pt]);
  if (sorted.length % 2 !== 0) {
    let byeIdx = [...sorted].reverse().findIndex(p => !p.matches.some(m => m.opponent === -1));
    byeIdx = byeIdx === -1 ? sorted.length - 1 : sorted.length - 1 - byeIdx;
    const [bye] = sorted.splice(byeIdx, 1);
    pairings.push({ p1: bye, p2: null });
  }
  while (sorted.length > 1) {
    const p1 = sorted.shift();
    let idx = sorted.findIndex(p => !p1.matches.some(m => m.opponent === p.id));
    if (idx === -1) idx = 0;
    const [p2] = sorted.splice(idx, 1);
    pairings.push({ p1, p2 });
  }
  return pairings;
}

// ─── Seating SVG ─────────────────────────────────────────────────────────────

function SeatingDiagram({ players }) {
  const n = players.length;
  const R = 13, pad = 44;

  // Distribute players: top = first ceil(n/2), bottom = rest
  const topPlayers = players.slice(0, Math.ceil(n / 2));
  const botPlayers = players.slice(Math.ceil(n / 2));

  // Table width grows to fit the larger side comfortably
  const maxSide = Math.max(topPlayers.length, botPlayers.length, 1);
  const slotW = 52; // px per player slot
  const tw = Math.max(160, maxSide * slotW);
  const th = 90;

  // SVG canvas — add horizontal padding for tokens that sit outside table edges
  const hPad = 40;
  const W = tw + hPad * 2;
  const H = 260;
  const cx = W / 2, cy = H / 2;
  const x0 = cx - tw / 2, y0 = cy - th / 2;
  const x1 = cx + tw / 2, y1 = cy + th / 2;

  const tokens = [];
  topPlayers.forEach((p, i) => {
    const c = tw / (topPlayers.length + 1);
    tokens.push({ px: x0 + c * (i + 1), py: y0 - pad, p });
  });
  botPlayers.forEach((p, i) => {
    const c = tw / (botPlayers.length + 1);
    tokens.push({ px: x0 + c * (i + 1), py: y1 + pad, p });
  });

  return (
    <svg width={W} height={H} style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x={x0} y={y0} width={tw} height={th} rx={10} fill="#1e1040" stroke="#8b6914" strokeWidth={2.5} filter="url(#glow)" />
      <text x={cx} y={cy + 5} textAnchor="middle" fill="#c9a84c" fontSize={12} fontFamily="Cinzel, serif" fontWeight="bold" letterSpacing={2}>
        DRAFT TABLE
      </text>
      {n === 0 && <text x={cx} y={cy + 24} textAnchor="middle" fill="#5a4a6a" fontSize={10} fontFamily="Crimson Pro, serif">Add players to see seating</text>}
      {tokens.map(({ px, py, p }, i) => (
        <g key={i}>
          <circle cx={px} cy={py} r={R} fill={p.color} stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} />
          <text x={px} y={py + R + 11} textAnchor="middle" fill="#d4c4a0" fontSize={8.5} fontFamily="Crimson Pro, serif" fontWeight="bold">
            {p.name.length > 9 ? p.name.slice(0, 9) + '…' : p.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [players, setPlayers] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [history, setHistory] = useState([]);
  const [pairings, setPairings] = useState([]);
  const [scores, setScores] = useState({});
  const [roundSubmitted, setRoundSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState('setup');
  const [bracketMatches, setBracketMatches] = useState([]);
  const [bracketScores, setBracketScores] = useState({});
  const [bracketLabel, setBracketLabel] = useState('');
  const [bracketActive, setBracketActive] = useState(false);
  const [winner, setWinner] = useState(null);
  const [timerSec, setTimerSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [deckMin, setDeckMin] = useState('30');
  const [roundMin, setRoundMin] = useState('50');
  const [matchFormat, setMatchFormat] = useState('bo3'); // 'bo1' or 'bo3'
  const [fontSize, setFontSize] = useState(1.5);       // applied on release
  const [sliderValue, setSliderValue] = useState(1.5); // tracks thumb while dragging
  const [newName, setNewName] = useState('');
  const [dropName, setDropName] = useState('');
  const [notif, setNotif] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const toast = (msg, type = 'ok') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3000);
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const timerText = !timerStarted ? '--:--' : timerSec === 0 ? "TIME'S UP" : fmt(timerSec);
  const timerColor = !timerStarted ? '#7a6a4a' : timerSec === 0 ? '#ff4444' : timerSec < 300 ? '#ff9944' : '#c9a84c';

  const startTimer = (mins) => {
    clearInterval(timerRef.current);
    const s = parseInt(mins) * 60;
    if (!s) return;
    setTimerSec(s); setTimerRunning(true); setTimerStarted(true);
    timerRef.current = setInterval(() => {
      setTimerSec(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); setTimerRunning(false); return 0; }
        return prev - 1;
      });
    }, 1000);
  };
  const stopTimer = () => { clearInterval(timerRef.current); setTimerRunning(false); setTimerSec(0); setTimerStarted(false); };

  const addPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    setPlayers(prev => {
      const id = prev.length ? Math.max(...prev.map(p => p.id)) + 1 : 0;
      const color = PLAYER_COLORS[prev.length % PLAYER_COLORS.length];
      return [...prev, { id, name, color, active: true, matches: [], points: 0, gamePoints: 0, gamesPlayed: 0, opponents: [] }];
    });
    setNewName('');
  };

  const removePlayer = id => setPlayers(prev => prev.filter(p => p.id !== id));

  const shuffle = () => setPlayers(prev => {
    const a = [...prev];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  });

  const saveSnap = (pls, rnd) => setHistory(h => [...h, JSON.stringify({ players: pls, round: rnd })]);

  const generateRound = () => {
    if (!players.length) { toast('Add players first!', 'err'); return; }
    saveSnap(players, currentRound);
    const pairs = makePairings(players);
    const rnd = currentRound + 1;
    setPairings(pairs);
    setCurrentRound(rnd);
    const byeWin = matchFormat === 'bo1' ? 1 : 2;
    const init = {};
    pairs.forEach((pair, i) => { init[i] = { s1: pair.p2 ? 0 : byeWin, s2: 0 }; });
    setScores(init);
    setRoundSubmitted(false);
    setActiveTab('swiss');
  };

  const submitResults = () => {
    if (!pairings.length) return;
    let updated = [...players];
    pairings.forEach((pair, i) => {
      const { s1 = 0, s2 = 0 } = scores[i] || {};
      const byeWin = matchFormat === 'bo1' ? 1 : 2;
      if (!pair.p2) {
        updated = updated.map(p => p.id === pair.p1.id ? applyMatch(p, currentRound, -1, byeWin, 0) : p);
      } else {
        const draw = Number(s1) === Number(s2);
        updated = updated.map(p => {
          if (p.id === pair.p1.id) return applyMatch(p, currentRound, pair.p2.id, Number(s1), Number(s2), draw);
          if (p.id === pair.p2.id) return applyMatch(p, currentRound, pair.p1.id, Number(s2), Number(s1), draw);
          return p;
        });
      }
    });
    setPlayers(updated);
    setRoundSubmitted(true);
    toast('Round results submitted!');
  };

  const undoAction = () => {
    if (!history.length) return;
    const prev = JSON.parse(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setPlayers(prev.players.map(p => recalcStats(p)));
    setCurrentRound(prev.round);
    setPairings([]); setScores({}); setRoundSubmitted(false);
    toast('Action undone.', 'info');
  };

  const dropPlayer = () => {
    const name = dropName.trim();
    const target = players.find(p => p.active && p.name.toLowerCase() === name.toLowerCase());
    if (!target) { toast('Player not found.', 'err'); return; }
    saveSnap(players, currentRound);
    setPlayers(prev => prev.map(p => p.id === target.id ? { ...p, active: false } : p));
    setDropName('');
    toast(`${target.name} dropped from tournament.`, 'info');
  };

  const cutToTop = n => {
    const st = computeStandings(players);
    if (st.length < n) { toast(`Not enough players for Top ${n}`, 'err'); return; }
    const top = st.slice(0, n).map(s => s.player);
    const matches = [];
    for (let i = 0; i < n / 2; i++) matches.push({ p1: top[i], p2: top[n - 1 - i] });
    setBracketMatches(matches); setBracketScores({});
    setBracketLabel(n === 8 ? 'Quarterfinals' : 'Semifinals');
    setBracketActive(true); setWinner(null);
    setActiveTab('bracket');
  };

  const advanceBracket = () => {
    const ws = [];
    for (let i = 0; i < bracketMatches.length; i++) {
      const { s1 = 0, s2 = 0 } = bracketScores[i] || {};
      if (Number(s1) > Number(s2)) ws.push(bracketMatches[i].p1);
      else if (Number(s2) > Number(s1)) ws.push(bracketMatches[i].p2);
      else { toast('No draws allowed in bracket play!', 'err'); return; }
    }
    if (ws.length === 1) { setWinner(ws[0]); return; }
    const next = [];
    for (let i = 0; i < ws.length; i += 2) if (i + 1 < ws.length) next.push({ p1: ws[i], p2: ws[i + 1] });
    setBracketMatches(next); setBracketScores({});
    setBracketLabel(next.length === 1 ? 'Finals' : 'Semifinals');
  };

  const standings = computeStandings(players);

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const input = { background: '#0c0a18', border: '1px solid #2d2050', borderRadius: 6, color: '#e0d4c0', padding: '8px 12px', fontFamily: "'Crimson Pro', serif", fontSize: 15, outline: 'none', width: '100%' };
  const numInput = { ...input, width: 60, textAlign: 'center', padding: '6px' };
  const btn = (v = 'gold') => ({
    padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: 1.2, fontWeight: '700',
    transition: 'opacity 0.15s, transform 0.1s',
    ...(v === 'gold' ? { background: 'linear-gradient(135deg, #7a580d, #c9a84c)', color: '#0c0a18' }
      : v === 'dark' ? { background: '#1e1540', border: '1px solid #3d2a6e', color: '#c9a84c' }
      : v === 'ghost' ? { background: 'transparent', border: '1px solid #3d2a6e', color: '#8a7a5a' }
      : { background: '#3a1515', border: '1px solid #7a2a2a', color: '#ff8888' })
  });
  const panel = (gold) => ({
    background: '#120e2a', border: `1px solid ${gold ? '#8b6914' : '#2d2050'}`,
    borderRadius: 10, padding: 20,
  });
  const sectionHead = { fontFamily: 'Cinzel, serif', fontSize: 13, color: '#c9a84c', letterSpacing: 2, fontWeight: '700', marginBottom: 14, borderBottom: '1px solid #2d2050', paddingBottom: 8 };

  return (
    <div style={{ width: `${100 / fontSize}%`, minHeight: `${100 / fontSize}vh`, transform: `scale(${fontSize})`, transformOrigin: 'top left', background: '#080614', color: '#e0d4c0', fontFamily: "'Crimson Pro', serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Pro:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #0c0a18; }
        ::-webkit-scrollbar-thumb { background: #3d2a6e; border-radius: 3px; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.5; }
        button:hover { opacity: 0.85; } button:active { transform: scale(0.97); }
      `}</style>

      {/* Notification Toast */}
      {notif && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          background: notif.type === 'err' ? '#300a0a' : notif.type === 'info' ? '#0a1a30' : '#0a2010',
          border: `1px solid ${notif.type === 'err' ? '#8b2020' : notif.type === 'info' ? '#205080' : '#208020'}`,
          color: '#e0d4c0', padding: '12px 20px', borderRadius: 8, maxWidth: 320,
          fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: 0.8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {notif.type === 'err' ? '⚠ ' : notif.type === 'info' ? 'ℹ ' : '✓ '}{notif.msg}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg, #1a0e3a 0%, #0c0a18 100%)',
        borderBottom: '2px solid #6b4a0a', padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 26 }}>⚔️</span>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 20, color: '#c9a84c', fontWeight: '700', letterSpacing: 3, textShadow: '0 0 24px rgba(201,168,76,0.5)' }}>
          MTG TOURNAMENT MANAGER
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
          {/* Font size control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 10, color: '#5a4a6a', letterSpacing: 1, whiteSpace: 'nowrap' }}>A</span>
            <input type="range" min={0.8} max={3.0} step={0.05} value={sliderValue}
              onChange={e => setSliderValue(parseFloat(e.target.value))}
              onMouseUp={e => setFontSize(parseFloat(e.target.value))}
              onTouchEnd={e => setFontSize(parseFloat(e.target.value))}
              style={{ width: 72, accentColor: '#c9a84c', cursor: 'pointer' }} />
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 14, color: '#5a4a6a', letterSpacing: 1, whiteSpace: 'nowrap' }}>A</span>
          </div>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 13, color: '#5a4a6a', letterSpacing: 1 }}>
            {players.length} PLAYERS · ROUND {currentRound}
          </span>
          {timerStarted && (
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: '700', color: timerColor, letterSpacing: 3, textShadow: `0 0 12px ${timerColor}66` }}>
              {timerText}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#0c0a18', borderBottom: '1px solid #2d2050', display: 'flex', padding: '0 20px' }}>
        {[
          { id: 'setup', label: '⚗  SETUP & DRAFT' },
          { id: 'swiss', label: '⚔  SWISS ROUNDS' },
          { id: 'bracket', label: '🏆  TOP CUT', disabled: !bracketActive },
        ].map(t => (
          <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} style={{
            padding: '12px 24px', fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: 1.5,
            cursor: t.disabled ? 'not-allowed' : 'pointer', border: 'none', background: 'transparent',
            color: activeTab === t.id ? '#c9a84c' : t.disabled ? '#3a2a4a' : '#6a5a4a',
            borderBottom: `2px solid ${activeTab === t.id ? '#c9a84c' : 'transparent'}`,
            marginBottom: -1, fontWeight: '700', opacity: t.disabled ? 0.5 : 1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>

        {/* ══════════════ SETUP TAB ══════════════ */}
        {activeTab === 'setup' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 1100, margin: '0 auto' }}>

            {/* Player Registration */}
            <div style={panel(true)}>
              <div style={sectionHead}>Player Registration</div>

              {/* Match Format */}
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#0c0a18', borderRadius: 8, border: '1px solid #2d2050' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 10, color: '#6a5a4a', letterSpacing: 1.5, marginBottom: 8 }}>MATCH FORMAT</div>
                <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #3d2a6e' }}>
                  {[['bo1', 'Best of 1'], ['bo3', 'Best of 3']].map(([val, label]) => (
                    <button key={val} onClick={() => setMatchFormat(val)} style={{
                      flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                      fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: 1, fontWeight: '700',
                      background: matchFormat === val ? 'linear-gradient(135deg, #7a580d, #c9a84c)' : '#1e1540',
                      color: matchFormat === val ? '#0c0a18' : '#6a5a4a',
                      transition: 'all 0.15s',
                    }}>{label}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontFamily: 'Crimson Pro, serif', fontSize: 12, color: '#5a4a6a', fontStyle: 'italic' }}>
                  {matchFormat === 'bo1' ? 'Games scored 1–0. Byes count as a win.' : 'Games scored up to 2–0 or 2–1. Byes count as 2–0.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input style={input} placeholder="Enter player name…" value={newName}
                  onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPlayer()} />
                <button style={{ ...btn('gold'), whiteSpace: 'nowrap', padding: '8px 20px' }} onClick={addPlayer}>Add +</button>
              </div>

              <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
                {players.length === 0 && (
                  <div style={{ color: '#4a3a5a', textAlign: 'center', padding: '30px 0', fontStyle: 'italic', fontSize: 14 }}>
                    No players yet…
                  </div>
                )}
                {players.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                    background: i % 2 === 0 ? '#0e0a22' : 'transparent', borderRadius: 5, marginBottom: 2,
                  }}>
                    <label title="Click to change color" style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}88`, border: '1.5px solid rgba(255,255,255,0.3)' }} />
                      <input type="color" value={p.color}
                        onChange={e => setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, color: e.target.value } : pl))}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, top: 0, left: 0 }} />
                    </label>
                    <span style={{ flex: 1, fontSize: 15 }}>{p.name}</span>
                    <button style={{ ...btn('red'), padding: '3px 10px', fontSize: 10 }} onClick={() => removePlayer(p.id)}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #2d2050', paddingTop: 14 }}>
                <button style={btn('dark')} onClick={shuffle}>🔀 Randomize Seating</button>
                <button style={btn('ghost')} onClick={() => {
                  const data = JSON.stringify({ players, round: currentRound });
                  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'tournament.json' });
                  a.click(); toast('Tournament saved!');
                }}>💾 Save</button>
                <label style={{ ...btn('ghost'), cursor: 'pointer', display: 'inline-block' }}>
                  📂 Load
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      try {
                        const data = JSON.parse(ev.target.result);
                        setPlayers(data.players.map(p => recalcStats(p))); setCurrentRound(data.round);
                        toast('Tournament loaded!');
                      } catch { toast('Failed to load file.', 'err'); }
                    };
                    reader.readAsText(file); e.target.value = '';
                  }} />
                </label>
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Draft Pod */}
              <div style={panel(true)}>
                <div style={sectionHead}>Draft Pod · {players.length} Player{players.length !== 1 ? 's' : ''}</div>
                <div style={{ overflowX: 'auto' }}>
                  <SeatingDiagram players={players} />
                </div>
              </div>

              {/* Timer */}
              <div style={panel(false)}>
                <div style={sectionHead}>Deck Build Timer</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input type="number" style={numInput} value={deckMin} onChange={e => setDeckMin(e.target.value)} min={1} max={180} />
                  <span style={{ color: '#6a5a4a', fontFamily: 'Cinzel, serif', fontSize: 11 }}>MIN</span>
                  <button style={btn('gold')} onClick={() => startTimer(deckMin)}>▶ Start</button>
                  <button style={btn('ghost')} onClick={stopTimer}>■ Stop</button>
                </div>
                <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'Cinzel, serif', fontSize: 42, fontWeight: '700', color: timerColor, letterSpacing: 5, textShadow: `0 0 24px ${timerColor}55` }}>
                  {timerText}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ SWISS TAB ══════════════ */}
        {activeTab === 'swiss' && (
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, maxWidth: 1100, margin: '0 auto' }}>

            {/* Left: Controls + Pairings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Action bar */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: 20, color: '#c9a84c', fontWeight: '700', marginRight: 6 }}>
                  Round {currentRound || '—'}
                </span>
                <button style={btn('gold')} onClick={generateRound}>⚔ Generate Pairings</button>
                <button style={{ ...btn('dark'), opacity: history.length ? 1 : 0.4 }} onClick={undoAction} disabled={!history.length}>↩ Undo</button>
              </div>

              {/* Round timer row */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="number" style={{ ...numInput, width: 55 }} value={roundMin} onChange={e => setRoundMin(e.target.value)} min={1} max={180} />
                <span style={{ color: '#6a5a4a', fontFamily: 'Cinzel, serif', fontSize: 11 }}>MIN</span>
                <button style={btn('ghost')} onClick={() => startTimer(roundMin)}>▶ Round Timer</button>
                <span style={{ marginLeft: 'auto', fontFamily: 'Cinzel, serif', fontSize: 18, fontWeight: '700', color: timerColor }}>{timerText}</span>
              </div>

              {/* Drop player */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={input} placeholder="Player name to drop…" value={dropName} onChange={e => setDropName(e.target.value)} onKeyDown={e => e.key === 'Enter' && dropPlayer()} />
                <button style={{ ...btn('red'), whiteSpace: 'nowrap' }} onClick={dropPlayer}>Drop Player</button>
              </div>

              {/* Pairings */}
              {pairings.length === 0 ? (
                <div style={{ ...panel(false), textAlign: 'center', padding: '40px 20px', color: '#4a3a5a', fontStyle: 'italic', fontSize: 15 }}>
                  No pairings yet. Add players in Setup, then click Generate Pairings.
                </div>
              ) : (
                <div style={panel(true)}>
                  <div style={{ ...sectionHead, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>Pairings — Round {currentRound}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'Cinzel, serif', fontSize: 9, letterSpacing: 1.5, color: '#8b6914', background: '#1a1000', border: '1px solid #4a3000', borderRadius: 4, padding: '2px 8px' }}>
                      {matchFormat === 'bo1' ? 'BEST OF 1' : 'BEST OF 3'}
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr>
                          {['Tbl', 'Player 1', 'Wins', '', 'Wins', 'Player 2'].map((h, i) => (
                            <th key={i} style={{ fontFamily: 'Cinzel, serif', fontSize: 10, letterSpacing: 1, color: '#6a5a4a', padding: '4px 10px', textAlign: i < 2 ? 'left' : 'center', borderBottom: '1px solid #2d2050', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pairings.map((pair, i) => {
                          const sc = scores[i] || { s1: 0, s2: 0 };
                          const disabled = roundSubmitted || !pair.p2;
                          const maxScore = matchFormat === 'bo1' ? 1 : 2;
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#0e0a22' : 'transparent' }}>
                              <td style={{ padding: '8px 10px', color: '#5a4a6a', fontFamily: 'Cinzel, serif', textAlign: 'center' }}>{i + 1}</td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: pair.p1.color, flexShrink: 0 }} />
                                  <span style={{ fontWeight: '600' }}>{pair.p1.name}</span>
                                </div>
                              </td>
                              <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                <input type="number" min={0} max={maxScore} disabled={disabled}
                                  style={{ ...numInput, width: 50, opacity: disabled ? 0.5 : 1 }}
                                  value={sc.s1}
                                  onChange={e => setScores(s => ({ ...s, [i]: { ...s[i], s1: e.target.value } }))} />
                              </td>
                              <td style={{ padding: '0 4px', color: '#5a4a6a', textAlign: 'center' }}>–</td>
                              <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                {pair.p2
                                  ? <input type="number" min={0} max={maxScore} disabled={roundSubmitted}
                                      style={{ ...numInput, width: 50, opacity: roundSubmitted ? 0.5 : 1 }}
                                      value={sc.s2}
                                      onChange={e => setScores(s => ({ ...s, [i]: { ...s[i], s2: e.target.value } }))} />
                                  : <span style={{ color: '#5a4a6a' }}>—</span>
                                }
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {pair.p2 ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: pair.p2.color, flexShrink: 0 }} />
                                    <span style={{ fontWeight: '600' }}>{pair.p2.name}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: '#8b6914', fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: 1 }}>BYE</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid #2d2050', flexWrap: 'wrap' }}>
                    <button style={{ ...btn('gold'), opacity: roundSubmitted ? 0.4 : 1 }} onClick={submitResults} disabled={roundSubmitted}>✓ Submit Results</button>
                    <button style={{ ...btn('ghost'), opacity: !roundSubmitted ? 0.4 : 1 }} onClick={() => setRoundSubmitted(false)} disabled={!roundSubmitted}>✎ Edit</button>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button style={btn('dark')} onClick={() => cutToTop(4)}>Cut Top 4</button>
                      <button style={btn('dark')} onClick={() => cutToTop(8)}>Cut Top 8</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Standings */}
            <div style={panel(false)}>
              <div style={sectionHead}>Standings</div>
              {standings.length === 0 ? (
                <div style={{ color: '#4a3a5a', textAlign: 'center', padding: 20, fontStyle: 'italic' }}>No players yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['#','Player','Pts','OMW%','GW%','OGW%'].map(h => (
                          <th key={h} style={{ fontFamily: 'Cinzel, serif', fontSize: 9, letterSpacing: 1, color: '#6a5a4a', padding: '4px 8px', textAlign: h === 'Player' ? 'left' : 'center', borderBottom: '1px solid #2d2050' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s, i) => (
                        <tr key={s.player.id} style={{ background: i % 2 === 0 ? '#0e0a22' : 'transparent', opacity: s.player.active ? 1 : 0.45 }}>
                          <td style={{ textAlign: 'center', padding: '7px 8px', color: '#5a4a6a', fontFamily: 'Cinzel, serif' }}>{i + 1}</td>
                          <td style={{ padding: '7px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.player.color, flexShrink: 0 }} />
                              <span>{s.player.name}{!s.player.active && ' (Drop)'}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', padding: '7px 8px', color: '#c9a84c', fontWeight: '600', fontFamily: 'Cinzel, serif' }}>{s.points}</td>
                          <td style={{ textAlign: 'center', padding: '7px 8px', color: '#8a7a6a' }}>{s.omw.toFixed(2)}</td>
                          <td style={{ textAlign: 'center', padding: '7px 8px', color: '#8a7a6a' }}>{s.gw.toFixed(2)}</td>
                          <td style={{ textAlign: 'center', padding: '7px 8px', color: '#8a7a6a' }}>{s.ogw.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════ BRACKET TAB ══════════════ */}
        {activeTab === 'bracket' && (
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 22, color: '#c9a84c', fontWeight: '700', letterSpacing: 4 }}>
                {winner ? '🏆 TOURNAMENT WINNER 🏆' : bracketLabel.toUpperCase()}
              </div>
            </div>

            {winner ? (
              <div style={{ ...panel(true), textAlign: 'center', padding: '50px 40px' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🏆</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 36, color: '#c9a84c', fontWeight: '700', marginBottom: 8, textShadow: '0 0 30px rgba(201,168,76,0.6)' }}>
                  {winner.name}
                </div>
                <div style={{ color: '#7a6a4a', fontSize: 16, letterSpacing: 2, fontFamily: 'Cinzel, serif' }}>TOURNAMENT CHAMPION</div>
                <button style={{ ...btn('dark'), marginTop: 24 }} onClick={() => { setWinner(null); setBracketActive(false); setActiveTab('setup'); }}>
                  New Tournament
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {bracketMatches.map((match, i) => {
                    const bs = bracketScores[i] || { s1: 0, s2: 0 };
                    return (
                      <div key={i} style={panel(true)}>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: 10, color: '#6a5a4a', letterSpacing: 2, marginBottom: 12 }}>MATCH {i + 1}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: match.p1.color, boxShadow: `0 0 8px ${match.p1.color}88` }} />
                            <span style={{ fontSize: 16, fontWeight: '600' }}>{match.p1.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="number" style={numInput} min={0} max={3}
                              value={bs.s1} onChange={e => setBracketScores(s => ({ ...s, [i]: { ...s[i], s1: e.target.value } }))} />
                            <span style={{ color: '#5a4a6a', fontFamily: 'Cinzel, serif', fontSize: 13 }}>vs</span>
                            <input type="number" style={numInput} min={0} max={3}
                              value={bs.s2} onChange={e => setBracketScores(s => ({ ...s, [i]: { ...s[i], s2: e.target.value } }))} />
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 16, fontWeight: '600', textAlign: 'right' }}>{match.p2.name}</span>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: match.p2.color, boxShadow: `0 0 8px ${match.p2.color}88` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ textAlign: 'center', marginTop: 24 }}>
                  <button style={{ ...btn('gold'), fontSize: 13, padding: '12px 36px' }} onClick={advanceBracket}>
                    ▶ Advance Round
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
