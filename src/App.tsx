import { useEffect, useState, useRef } from 'react';
import { GameEngine } from './game/engine';
import { GameState, TurnPhase, PassMethod, PlayerState, CardProperty, GameMode, Zone } from './game/types';
import { Shield, AlertTriangle, Star, Check, X, Skull, ArrowRight, Trash2 } from 'lucide-react';

export default function App() {
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedToDiscard, setSelectedToDiscard] = useState<string[]>([]);
  const [pendingDeliverCardId, setPendingDeliverCardId] = useState<string | null>(null);

  // Dealer Panel States
  const [dealerTarget, setDealerTarget] = useState<string>('p1');
  const [dealerCardName, setDealerCardName] = useState<string>('');
  const [dealerProps, setDealerProps] = useState<CardProperty[]>([CardProperty.DANGER]);
  const [rngMin, setRngMin] = useState(1);
  const [rngMax, setRngMax] = useState(10);
  const [rngResult, setRngResult] = useState<number | null>(null);

  // Rename & Faction State
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // GM Double Click Actions State
  const [openGMCards, setOpenGMCards] = useState<string[]>([]);

  const startGame = (mode: GameMode) => {
    setGameMode(mode);
    const newEngine = new GameEngine(mode, (state) => {
      setGameState(state);
    });
    setEngine(newEngine);
    setGameState(newEngine.state);

    if (newEngine.state.currentPhase === TurnPhase.PREP) {
      newEngine.nextPhase();
    }
  };

  useEffect(() => {
    if (autoScroll) {
      setTimeout(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 50);
    }
  }, [gameState?.logs, autoScroll]);

  if (!gameMode || !engine || !gameState) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100 font-sans">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Dangerous Token MVP</h1>
        <p className="text-zinc-400 mb-8">选择游戏模式</p>
        <div className="flex gap-4">
          <button onClick={() => startGame(GameMode.RANDOM)} className="px-6 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl flex flex-col items-center gap-2 transition-transform hover:scale-105">
            <span className="font-bold text-xl">随机模式</span>
            <span className="text-xs text-indigo-200">系统自动分发初始手牌。</span>
          </button>
          <button onClick={() => startGame(GameMode.GM)} className="px-6 py-4 bg-amber-600 hover:bg-amber-500 rounded-xl flex flex-col items-center gap-2 transition-transform hover:scale-105">
            <span className="font-bold text-xl">GM 模式</span>
            <span className="text-xs text-amber-200">手动控制发牌与卡牌状态。</span>
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col md:flex-row">
      {/* Left Panel: Game Board */}
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
        <header className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Dangerous Token MVP</h1>
            <p className="text-zinc-400 text-sm">回合: {currentPlayer.name} | 阶段: <span className="text-emerald-400 font-mono">{gameState.currentPhase}</span></p>
          </div>
          <div className="flex gap-2">
            {gameState.winner && (
              <div className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-lg font-bold">
                {gameState.winner} 胜利！
              </div>
            )}
            {!gameState.winner && !gameState.passState && !gameState.dyingState && (
              <button
                onClick={() => engine.nextPhase()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
              >
                进入下一阶段
              </button>
            )}
          </div>
        </header>

        {/* Dealer (GM) Panel */}
        {gameMode === GameMode.GM && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col xl:flex-row gap-6 items-start xl:items-center">
            <div className="flex-1 w-full space-y-3">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">🕹️ GM 发牌控制台</h3>
              <div className="flex gap-2 text-sm flex-wrap items-center">
                <select value={dealerTarget} onChange={e => setDealerTarget(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200">
                  {gameState.players.filter(p => p.state !== PlayerState.DEAD).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input type="text" placeholder="卡牌标题" value={dealerCardName} onChange={e => setDealerCardName(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 flex-1 min-w-[120px]" />
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={dealerProps.includes(CardProperty.TOP_SECRET)} onChange={e => {
                  const prev = new Set(dealerProps); e.target.checked ? prev.add(CardProperty.TOP_SECRET) : prev.delete(CardProperty.TOP_SECRET); setDealerProps(Array.from(prev));
                }} /> <span className="text-red-400">绝密</span></label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={dealerProps.includes(CardProperty.PRECIOUS)} onChange={e => {
                  const prev = new Set(dealerProps); e.target.checked ? prev.add(CardProperty.PRECIOUS) : prev.delete(CardProperty.PRECIOUS); setDealerProps(Array.from(prev));
                }} /> <span className="text-blue-400">珍贵</span></label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={dealerProps.includes(CardProperty.DANGER)} onChange={e => {
                  const prev = new Set(dealerProps); e.target.checked ? prev.add(CardProperty.DANGER) : prev.delete(CardProperty.DANGER); setDealerProps(Array.from(prev));
                }} /> <span className="text-zinc-400">危险</span></label>
                <button disabled={dealerProps.length === 0} onClick={() => { engine.dealerGrantCard(dealerTarget, dealerCardName, dealerProps); setDealerCardName(''); }} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded transition-colors whitespace-nowrap">发给玩家</button>
              </div>
            </div>
            <div className="w-px h-12 bg-zinc-800 hidden xl:block"></div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-zinc-400 font-medium">随机数:</div>
              <input type="number" value={rngMin} onChange={e => setRngMin(Number(e.target.value))} className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-center" />
              <span className="text-zinc-600">-</span>
              <input type="number" value={rngMax} onChange={e => setRngMax(Number(e.target.value))} className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-center" />
              <button onClick={() => setRngResult(Math.floor(Math.random() * (rngMax - rngMin + 1)) + rngMin)} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-white font-medium">掷骰</button>
              {rngResult !== null && <div className="ml-2 w-8 h-8 flex items-center justify-center bg-indigo-500/20 text-indigo-300 font-bold rounded ring-1 ring-indigo-500/50">{rngResult}</div>}
            </div>
          </div>
        )}

        {/* Players Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {gameState.players.map(player => {
            const isCurrent = gameMode === GameMode.GM ? false : player.id === currentPlayer.id;
            const isTarget = gameState.passState?.currentTargetId === player.id;
            const isDying = player.state === PlayerState.DYING;
            const isDead = player.state === PlayerState.DEAD;

            return (
              <div
                key={player.id}
                className={`p-4 rounded-xl border ${isCurrent ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-800 bg-zinc-900/50'} ${isTarget ? 'ring-2 ring-amber-500' : ''} ${isDead ? 'opacity-50 grayscale' : ''}`}
                onDragOver={gameMode === GameMode.GM ? (e) => e.preventDefault() : undefined}
                onDrop={gameMode === GameMode.GM ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const cardId = e.dataTransfer.getData('cardId');
                  if (cardId) engine.transferCard(cardId, player.id, Zone.HAND);
                } : undefined}
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    {editingPlayerId === player.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onBlur={() => { if (editingName.trim()) { engine.renamePlayer(player.id, editingName.trim()); } setEditingPlayerId(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') { if (editingName.trim()) { engine.renamePlayer(player.id, editingName.trim()); } setEditingPlayerId(null); } }}
                        className="bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-sm w-24 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    ) : (
                      <span onClick={() => { setEditingPlayerId(player.id); setEditingName(player.name.replace(' (You)', '')); }} className="cursor-pointer hover:underline decoration-zinc-500 decoration-dashed underline-offset-4">{player.name}</span>
                    )}
                    {gameMode === GameMode.GM ? (
                      <select
                        value={player.faction}
                        onChange={e => engine.changePlayerFaction(player.id, e.target.value as import('./game/types').Faction)}
                        className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 outline-none hover:bg-zinc-700 cursor-pointer"
                      >
                        <option value="THUMB">THUMB</option>
                        <option value="FINGER">FINGER</option>
                        <option value="BUS">BUS</option>
                        <option value="MYSTERY">MYSTERY</option>
                      </select>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">{player.faction}</span>
                    )}
                    {isDying && <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 animate-pulse">DYING</span>}
                    {isDead && <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-500">DEAD</span>}
                  </h3>
                  <div className="text-xs text-zinc-500">手牌: {player.hand.length}</div>
                </div>

                {/* Field */}
                <div className="mb-4">
                  <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">信物区</div>
                  <div
                    className="flex flex-wrap gap-2 min-h-[60px] p-2 bg-zinc-950 rounded-lg border border-zinc-800/50"
                    onDragOver={gameMode === GameMode.GM ? (e) => e.preventDefault() : undefined}
                    onDrop={gameMode === GameMode.GM ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const cardId = e.dataTransfer.getData('cardId');
                      if (cardId) engine.transferCard(cardId, player.id, Zone.FIELD_TOKEN);
                    } : undefined}
                  >
                    {player.field.map(card => (
                      <CardView key={card.id} card={card} isGM={gameMode === GameMode.GM} onTrash={() => engine.destroyCard(card.id)} />
                    ))}
                    {player.field.length === 0 && <span className="text-zinc-700 text-sm italic my-auto">空</span>}
                  </div>
                </div>

                {/* Hand */}
                <div>
                  <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">手牌</div>
                  {gameState.discardState?.active && isCurrent && (
                    <div className="mb-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                      <p className="text-sm text-indigo-400 mb-2 font-medium">弃牌阶段：请选择 {gameState.discardState.requiredCount} 张牌</p>
                      <button
                        disabled={selectedToDiscard.length !== gameState.discardState.requiredCount}
                        onClick={() => {
                          engine.discardCards(player.id, selectedToDiscard);
                          setSelectedToDiscard([]);
                        }}
                        className="px-3 py-1 bg-indigo-600 disabled:opacity-50 hover:bg-indigo-500 text-white text-sm rounded transition-all"
                      >
                        确认弃牌
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {player.hand.map(card => {
                      const isDiscardTarget = selectedToDiscard.includes(card.id);
                      return (
                        <div key={card.id} className="relative group cursor-pointer"
                          onClick={() => {
                            if (gameState.discardState?.active && isCurrent) {
                              if (isDiscardTarget) setSelectedToDiscard(prev => prev.filter(id => id !== card.id));
                              else setSelectedToDiscard(prev => [...prev, card.id]);
                            }
                          }}
                          onDoubleClick={() => {
                            if (gameMode === GameMode.GM) {
                              setOpenGMCards(prev => prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id]);
                            }
                          }}
                        >
                          <div className={isDiscardTarget ? "ring-2 ring-indigo-500 rounded-md" : ""}>
                            <CardView card={card} isGM={gameMode === GameMode.GM} onTrash={() => engine.destroyCard(card.id)} />
                          </div>
                          {/* Actions overlay */}
                          {!isDead && !gameState.passState && !gameState.discardState?.active && (
                            (gameMode === GameMode.GM && openGMCards.includes(card.id)) ||
                            (gameMode !== GameMode.GM && isCurrent && (gameState.currentPhase === TurnPhase.ACTION || gameState.currentPhase === TurnPhase.PASS) && !currentPlayer.hasPassed)
                          ) && (
                              <div className={`absolute inset-0 bg-black/80 flex flex-col gap-1 items-center justify-center transition-opacity rounded-md ${pendingDeliverCardId === card.id || openGMCards.includes(card.id) ? 'opacity-100 z-20' : 'opacity-0 group-hover:opacity-100'}`}>
                                {pendingDeliverCardId === card.id ? (
                                  <>
                                    <div className="text-[10px] text-zinc-300 font-medium mb-1 border-b border-zinc-700 w-full text-center pb-1">送给谁？</div>
                                    <div className="flex flex-col gap-1 w-full px-2 overflow-y-auto" style={{ maxHeight: '70px' }}>
                                      {gameState.players.filter(p => p.id !== player.id && p.state !== PlayerState.DEAD).map(p => (
                                        <button key={p.id} onClick={(e) => { e.stopPropagation(); engine.initiatePass(card.id, PassMethod.DELIVER, p.id); setPendingDeliverCardId(null); }} className="text-[10px] bg-indigo-600 hover:bg-indigo-500 py-0.5 rounded text-white truncate px-1">
                                          {p.name}
                                        </button>
                                      ))}
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setPendingDeliverCardId(null); }} className="text-[10px] w-14 bg-red-600/80 hover:bg-red-500 py-0.5 mt-1 rounded text-white">取消</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); engine.initiatePass(card.id, PassMethod.SECRET); }} className="text-[10px] w-14 bg-indigo-600 hover:bg-indigo-500 py-1 rounded text-white">机密</button>
                                    <button onClick={(e) => { e.stopPropagation(); engine.initiatePass(card.id, PassMethod.REPORT); }} className="text-[10px] w-14 bg-indigo-600 hover:bg-indigo-500 py-1 rounded text-white">报告</button>
                                    <button onClick={(e) => {
                                      e.stopPropagation();
                                      setPendingDeliverCardId(card.id);
                                    }} className="text-[10px] w-14 bg-indigo-600 hover:bg-indigo-500 py-1 rounded text-white">给予</button>
                                  </>
                                )}
                              </div>
                            )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Interactions */}
                {isTarget && gameState.passState && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex flex-col items-center gap-3">
                    <div className="flex w-full justify-between items-center">
                      <span className="text-sm text-amber-400 font-medium">收到传递: {
                        gameState.passState.method === PassMethod.SECRET ? '机密 (SECRET)' :
                          gameState.passState.method === PassMethod.REPORT ? '报告 (REPORT)' : '给予 (DELIVER)'
                      }</span>
                    </div>
                    <div>
                      <CardView card={gameState.passState.card} hidden={gameState.passState.method !== PassMethod.REPORT} />
                    </div>
                    <div className="flex gap-2 border-t border-amber-500/30 pt-2 w-full justify-center">
                      <button onClick={() => engine.acceptPass(player.id)} className="flex flex-1 justify-center items-center py-1.5 bg-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/30 rounded">接收 <Check size={16} className="ml-1" /></button>
                      <button onClick={() => engine.rejectPass(player.id)} className="flex flex-1 justify-center items-center py-1.5 bg-red-500/20 text-red-400 font-medium hover:bg-red-500/30 rounded">拒绝 <X size={16} className="ml-1" /></button>
                    </div>
                  </div>
                )}

                {isDying && gameState.dyingState?.playerId === player.id && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex justify-between items-center">
                    <span className="text-sm text-red-400 font-medium">濒死！需要救援。</span>
                    <button onClick={() => engine.confirmDeath(player.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded">确认阵亡</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel: Logs */}
      <div className="w-full md:w-80 border-l border-zinc-800 bg-zinc-900/30 flex flex-col h-screen">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <h2 className="font-mono text-sm uppercase tracking-wider text-zinc-400">系统日志</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-indigo-500 focus:ring-indigo-500/50"
            />
            自动滚动
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-zinc-400 space-y-2">
          {gameState.logs.map((log, i) => (
            <div key={i} className={`${log.includes('!!!') ? 'text-red-400 font-bold' : log.includes('wins') ? 'text-emerald-400 font-bold' : ''}`}>
              {log}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}

interface CardViewProps {
  card: any;
  hidden?: boolean;
  isGM?: boolean;
  onTrash?: () => void;
  key?: string | number;
}
function CardView({ card, hidden, isGM, onTrash }: CardViewProps) {
  if (hidden) {
    return (
      <div className="w-20 h-28 rounded-md border p-2 flex flex-col items-center justify-center bg-zinc-900 border-zinc-800 select-none shadow-md relative">
        <Shield size={24} className="text-zinc-700" />
        {isGM && <button onClick={onTrash} className="absolute top-1 right-1 text-zinc-500 hover:text-red-500"><Trash2 size={12} /></button>}
      </div>
    );
  }

  const isDanger = card.properties.includes(CardProperty.DANGER);
  const isPrecious = card.properties.includes(CardProperty.PRECIOUS);
  const isTopSecret = card.properties.includes(CardProperty.TOP_SECRET);

  return (
    <div
      className={`relative w-20 h-28 rounded-md border p-2 flex flex-col justify-between select-none bg-zinc-800 border-zinc-700 shadow-md ${isGM ? 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-zinc-500' : ''}`}
      draggable={isGM}
      onDragStart={isGM ? (e) => {
        e.dataTransfer.setData('cardId', card.id);
      } : undefined}
    >
      {isGM && <button onClick={onTrash} className="absolute top-1 right-1 text-zinc-500 hover:text-red-500 z-50 p-1"><Trash2 size={12} /></button>}
      <div className="flex flex-col gap-1.5 z-10 w-full items-start pointer-events-none">
        {isTopSecret && <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" title="绝密" />}
        {isPrecious && <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" title="珍贵" />}
        {isDanger && <div className="w-3 h-3 rounded-full bg-black border border-zinc-600 shadow-[0_0_5px_rgba(0,0,0,0.5)]" title="危险" />}
      </div>
      <div className="text-[10px] font-medium leading-tight text-center text-zinc-300 z-10 border-t border-zinc-700/50 pt-1 mt-1 pointer-events-none">
        {card.name}
      </div>
    </div>
  );
}

