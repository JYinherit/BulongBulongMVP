import { useEffect, useState, useRef, useCallback } from 'react';
import { GameEngine } from './game/engine';
import { GameState, TurnPhase, PassMethod, PlayerState, CardProperty, GameMode, Zone } from './game/types';
import { Shield, Check, X, Trash2, Image, FolderOpen, X as XIcon } from 'lucide-react';
import { getCache, batchSaveToCache, getImageObjectUrl, generateThumbnail, removeFromCache, clearCache, formatFileSize, ImageCacheMeta } from './imageCache';

const CARD_PROPERTIES_CONFIG = [
  { value: CardProperty.TOP_SECRET, label: '绝密', colorClass: 'text-red-400' },
  { value: CardProperty.PRECIOUS, label: '珍贵', colorClass: 'text-blue-400' },
  { value: CardProperty.DANGER, label: '危险', colorClass: 'text-zinc-400' },
];

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
  const [dealerImageUrl, setDealerImageUrl] = useState<string>('');
  const [rngMin, setRngMin] = useState(1);
  const [rngMax, setRngMax] = useState(10);
  const [rngResult, setRngResult] = useState<number | null>(null);

  // Image Cache States
  const [imageCache, setImageCache] = useState<Map<string, ImageCacheMeta>>(new Map());
  const [selectedCacheName, setSelectedCacheName] = useState<string | null>(null);
  const [showCachePanel, setShowCachePanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 追踪当前 Object URL 以便切换时撤销
  const prevObjectUrlRef = useRef<string | null>(null);

  /** 刷新缓存元数据（不含 Blob，极小） */
  const refreshCache = useCallback(() => { getCache().then(setImageCache); }, []);

  // 初始化时加载缓存
  useEffect(() => { refreshCache(); }, [refreshCache]);

  /** 设置图片 URL，自动撤销上一个 Object URL */
  const applyImageUrl = useCallback((url: string, cacheName: string | null = null) => {
    if (prevObjectUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(prevObjectUrlRef.current);
    }
    prevObjectUrlRef.current = url.startsWith('blob:') ? url : null;
    setDealerImageUrl(url);
    setSelectedCacheName(cacheName);
  }, []);

  /** 将 FileList 中所有图片生成缩略图后存入 IndexedDB（Blob 原始存储，无 Base64 开销） */
  const handleFilesUpload = useCallback((files: FileList) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    Promise.all(imageFiles.map(async (file) => ({
      name: file.name,
      blob: file as Blob,
      thumbnail: await generateThumbnail(file), // Canvas 小图，仅几 KB
      size: file.size,
    }))).then(async (results) => {
      await batchSaveToCache(results); // 一个 IDB 事务
      const last = results[results.length - 1];
      // 直接用已有的 File 创建 Object URL，无需再读 IDB
      applyImageUrl(URL.createObjectURL(last.blob), last.name);
      refreshCache();
    });
  }, [refreshCache, applyImageUrl]);

  // Rename & Faction State
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // GM Double Click Actions State
  const [openGMCards, setOpenGMCards] = useState<string[]>([]);

  const toggleDealerProperty = (property: CardProperty, checked: boolean) => {
    const prev = new Set(dealerProps);
    if (checked) {
      prev.add(property);
    } else {
      prev.delete(property);
    }
    setDealerProps(Array.from(prev));
  };

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

  // AI Auto-play hook
  useEffect(() => {
    if (!gameState || !engine) return;
    if (gameState.winner) return;
    if (gameMode !== GameMode.RANDOM) return;

    let timeoutId: NodeJS.Timeout;

    // 1. If waiting for pass response from an AI
    if (gameState.passState?.active) {
      const targetPlayer = gameState.players.find(p => p.id === gameState.passState!.currentTargetId);
      if (targetPlayer?.isBot) {
        timeoutId = setTimeout(() => {
          if (Math.random() > 0.5) {
            engine.acceptPass(targetPlayer.id);
          } else {
            engine.rejectPass(targetPlayer.id);
          }
        }, 1500);
        return () => clearTimeout(timeoutId);
      }
    }

    // 2. If waiting for discard from an AI
    if (gameState.discardState?.active) {
      const targetPlayer = gameState.players.find(p => p.id === gameState.discardState!.playerId);
      if (targetPlayer?.isBot) {
        timeoutId = setTimeout(() => {
          const count = gameState.discardState!.requiredCount;
          // Discard random cards
          const toDiscard = [...targetPlayer.hand].sort(() => Math.random() - 0.5).slice(0, count).map(c => c.id);
          engine.discardCards(targetPlayer.id, toDiscard);
        }, 1500);
        return () => clearTimeout(timeoutId);
      }
    }

    // 3. AI's turn to act or pass
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer?.isBot && !gameState.passState && !gameState.discardState) {
      timeoutId = setTimeout(() => {
        if (gameState.currentPhase === TurnPhase.ACTION || gameState.currentPhase === TurnPhase.PASS) {
          if (!currentPlayer.hasPassed && currentPlayer.hand.length > 0) {
            const cardToPass = currentPlayer.hand[Math.floor(Math.random() * currentPlayer.hand.length)];
            const methods = [PassMethod.SECRET, PassMethod.REPORT, PassMethod.DELIVER];
            const method = methods[Math.floor(Math.random() * methods.length)];

            if (method === PassMethod.DELIVER) {
              const eligibleTargets = gameState.players.filter(p => p.id !== currentPlayer.id && p.state !== PlayerState.DEAD);
              if (eligibleTargets.length > 0) {
                const target = eligibleTargets[Math.floor(Math.random() * eligibleTargets.length)];
                engine.initiatePass(cardToPass.id, method, target.id);
              } else {
                engine.nextPhase();
              }
            } else {
              engine.initiatePass(cardToPass.id, method);
            }
          } else {
            engine.nextPhase();
          }
        } else {
          engine.nextPhase();
        }
      }, 1500);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [gameState, engine, gameMode]);

  useEffect(() => {
    if (!gameState) return;
    const alivePlayers = gameState.players.filter(p => p.state !== PlayerState.DEAD);
    const targetStillAlive = alivePlayers.some(p => p.id === dealerTarget);
    if (!targetStillAlive && alivePlayers.length > 0) {
      setDealerTarget(alivePlayers[0].id);
    }
  }, [gameState?.players]);

  if (!gameMode || !engine || !gameState) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100 font-sans">
        <h1 className="text-4xl font-bold tracking-tight mb-2">BulongBulongMVP</h1>
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
                disabled={gameMode === GameMode.RANDOM && currentPlayer.isBot}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
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
                {CARD_PROPERTIES_CONFIG.map(({ value, label, colorClass }) => (
                  <label key={value} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dealerProps.includes(value)}
                      onChange={e => toggleDealerProperty(value, e.target.checked)}
                    />
                    <span className={colorClass}>{label}</span>
                  </label>
                ))}
                <button disabled={dealerProps.length === 0} onClick={() => { engine.dealerGrantCard(dealerTarget, dealerCardName, dealerProps, dealerImageUrl || null); setDealerCardName(''); setDealerImageUrl(''); }} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded transition-colors whitespace-nowrap">发给玩家</button>
                <button onClick={() => engine.addPlayer()} className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-medium rounded transition-colors whitespace-nowrap">➕ 增加玩家</button>
              </div>
              {/* Image Picker Row */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-zinc-500 flex items-center gap-1"><Image size={12} /> 卡牌图片:</span>
                <input
                  type="text"
                  placeholder="粘贴图片 URL..."
                  value={dealerImageUrl.startsWith('blob:') ? '（本地文件）' : dealerImageUrl}
                  readOnly={dealerImageUrl.startsWith('blob:')}
                  onChange={e => applyImageUrl(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 flex-1 min-w-[160px] text-xs text-zinc-300"
                />
                {/* 本地文件上传 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files?.length) handleFilesUpload(e.target.files); e.target.value = ''; }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-xs text-zinc-200 rounded transition-colors whitespace-nowrap"
                >
                  <FolderOpen size={12} /> 本地文件
                </button>
                {/* 缓存选择器 */}
                <button
                  onClick={() => setShowCachePanel(v => !v)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap ${showCachePanel ? 'bg-indigo-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}
                >
                  缓存 ({imageCache.size})
                </button>
                {dealerImageUrl && (
                  <button onClick={() => applyImageUrl('')} className="text-zinc-500 hover:text-red-400 transition-colors" title="清除图片">
                    <XIcon size={14} />
                  </button>
                )}
                {dealerImageUrl && (
                  <img src={dealerImageUrl} alt="preview" className="w-8 h-10 object-cover rounded border border-zinc-600" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                )}
              </div>
              {/* Cache Panel */}
              {showCachePanel && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-zinc-400 font-medium">图片缓存 · {imageCache.size} 个文件</span>
                    <div className="flex gap-2">
                      {imageCache.size > 0 && (
                        <button
                          onClick={() => { clearCache().then(() => refreshCache()); }}
                          className="text-xs text-red-500 hover:text-red-400 transition-colors"
                        >全部清除</button>
                      )}
                      <button onClick={() => setShowCachePanel(false)} className="text-zinc-500 hover:text-zinc-300"><XIcon size={14} /></button>
                    </div>
                  </div>
                  {imageCache.size === 0 ? (
                    <p className="text-xs text-zinc-600 text-center py-3">暂无缓存，上传本地图片后将自动保存</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-36 overflow-y-auto">
                      {Array.from<ImageCacheMeta>(imageCache.values()).sort((a, b) => b.lastUsed - a.lastUsed).map(entry => (
                        <div
                          key={entry.name}
                          className={`group relative flex flex-col items-center cursor-pointer rounded-md overflow-hidden border transition-all ${selectedCacheName === entry.name ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-zinc-700 hover:border-zinc-500'}`}
                          onClick={() => {
                            getImageObjectUrl(entry.name).then(url => {
                              if (url) applyImageUrl(url, entry.name);
                            });
                          }}
                          title={`${entry.name}\n${formatFileSize(entry.size)}`}
                        >
                          <img src={entry.thumbnail} alt={entry.name} className="w-full h-12 object-cover" />
                          <div className="w-full bg-zinc-900 px-1 py-0.5">
                            <p className="text-[9px] text-zinc-400 truncate">{entry.name}</p>
                            <p className="text-[9px] text-zinc-600">{formatFileSize(entry.size)}</p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); removeFromCache(entry.name).then(() => { if (selectedCacheName === entry.name) applyImageUrl(''); refreshCache(); }); }}
                            className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-red-600 text-zinc-300 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                      <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400">
                        {gameMode === GameMode.RANDOM && player.isBot ? '???' : player.faction}
                      </span>
                    )}
                    {isDying && <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 animate-pulse">DYING</span>}
                    {isDead && <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-500">DEAD</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-zinc-500">手牌: {player.hand.length}</div>
                    {gameMode === GameMode.GM && (
                      <button
                        onClick={() => engine.removePlayer(player.id)}
                        title="移除玩家"
                        className="text-xs px-2 py-0.5 bg-red-900/40 hover:bg-red-700 text-red-400 hover:text-white border border-red-800/50 rounded transition-colors"
                      >
                        移除
                      </button>
                    )}
                  </div>
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
                          onMouseLeave={() => {
                            if (gameMode === GameMode.GM) {
                              setOpenGMCards(prev => prev.filter(id => id !== card.id));
                            }
                          }}
                          onDoubleClick={() => {
                            if (gameMode === GameMode.GM) {
                              setOpenGMCards(prev => prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id]);
                            }
                          }}
                        >
                          <div className={isDiscardTarget ? "ring-2 ring-indigo-500 rounded-md" : ""}>
                            <CardView card={card} hidden={gameMode === GameMode.RANDOM && player.isBot} isGM={gameMode === GameMode.GM} onTrash={() => engine.destroyCard(card.id)} />
                          </div>
                          {/* Actions overlay */}
                          {!isDead && !gameState.passState && !gameState.discardState?.active && !player.isBot && (
                            (gameMode === GameMode.GM && openGMCards.includes(card.id)) ||
                            (gameMode !== GameMode.GM && isCurrent && (gameState.currentPhase === TurnPhase.ACTION || gameState.currentPhase === TurnPhase.PASS) && !currentPlayer.hasPassed)
                          ) && (
                              <div className={`absolute inset-0 bg-black/85 flex flex-col gap-1.5 items-center justify-center transition-opacity rounded-md ${pendingDeliverCardId === card.id || openGMCards.includes(card.id) ? 'opacity-100 z-20' : 'opacity-0 group-hover:opacity-100'}`}>
                                {pendingDeliverCardId === card.id ? (
                                  <>
                                    <div className="text-xs text-zinc-200 font-semibold border-b border-zinc-600 w-full text-center pb-1.5 mb-0.5">送给谁？</div>
                                    <div className="flex flex-col gap-1 w-full px-2 overflow-y-auto" style={{ maxHeight: '120px' }}>
                                      {gameState.players.filter(p => p.id !== player.id && p.state !== PlayerState.DEAD).map(p => (
                                        <button key={p.id} onClick={(e) => { e.stopPropagation(); engine.initiatePass(card.id, PassMethod.DELIVER, p.id); setPendingDeliverCardId(null); }} className="text-xs bg-indigo-600 hover:bg-indigo-500 py-1 rounded text-white truncate px-2">
                                          {p.name}
                                        </button>
                                      ))}
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setPendingDeliverCardId(null); }} className="text-xs w-16 bg-red-600/80 hover:bg-red-500 py-1 mt-0.5 rounded text-white">取消</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); engine.initiatePass(card.id, PassMethod.SECRET); }} className="text-xs w-16 bg-indigo-600 hover:bg-indigo-500 py-1.5 rounded text-white font-medium">机密</button>
                                    <button onClick={(e) => { e.stopPropagation(); engine.initiatePass(card.id, PassMethod.REPORT); }} className="text-xs w-16 bg-indigo-600 hover:bg-indigo-500 py-1.5 rounded text-white font-medium">报告</button>
                                    <button onClick={(e) => {
                                      e.stopPropagation();
                                      setPendingDeliverCardId(card.id);
                                    }} className="text-xs w-16 bg-indigo-600 hover:bg-indigo-500 py-1.5 rounded text-white font-medium">给予</button>
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
  const hasImage = !!card.imageUrl;

  return (
    <div
      className={`relative w-20 h-28 rounded-md border flex flex-col justify-between select-none shadow-md overflow-hidden ${hasImage ? 'border-zinc-600 bg-zinc-900' : 'bg-zinc-800 border-zinc-700 p-2'} ${isGM ? 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-zinc-500' : ''}`}
      draggable={isGM}
      onDragStart={isGM ? (e) => {
        e.dataTransfer.setData('cardId', card.id);
      } : undefined}
    >
      {/* Custom card image background */}
      {hasImage && (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="absolute inset-0 w-full h-full object-cover opacity-80"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      {/* scrim so text is readable over image */}
      {hasImage && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />}

      {isGM && <button onClick={onTrash} className="absolute top-1 right-1 text-zinc-400 hover:text-red-500 z-50 p-1 bg-black/40 rounded"><Trash2 size={12} /></button>}
      <div className={`flex flex-col gap-1.5 z-10 w-full items-start ${hasImage ? 'p-1.5' : ''} pointer-events-none`}>
        {isTopSecret && <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" title="绝密" />}
        {isPrecious && <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" title="珍贵" />}
        {isDanger && <div className="w-3 h-3 rounded-full bg-black border border-zinc-600 shadow-[0_0_5px_rgba(0,0,0,0.5)]" title="危险" />}
      </div>
      <div className={`text-[10px] font-medium leading-tight text-center text-zinc-200 z-10 border-t ${hasImage ? 'border-white/20 bg-black/40 px-1 py-1 mb-0' : 'border-zinc-700/50 pt-1 mt-1 mx-2 mb-2'} pointer-events-none`}>
        {card.name}
      </div>
    </div>
  );
}

