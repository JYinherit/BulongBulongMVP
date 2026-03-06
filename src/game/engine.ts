import { Faction, CardProperty, Zone, PassMethod, PlayerState, TurnPhase, Card, Player, GameState, GameMode } from './types';

const generateId = () => Math.random().toString(36).substring(2, 9);

export class GameEngine {
  state: GameState;
  onStateChange: (state: GameState) => void;

  constructor(mode: GameMode, onStateChange: (state: GameState) => void) {
    this.onStateChange = onStateChange;
    this.state = this.createInitialState(mode);
  }

  createInitialState(mode: GameMode): GameState {
    let players: Player[] = [];
    if (mode === GameMode.RANDOM) {
      const factions = [Faction.FINGER, Faction.FINGER, Faction.THUMB, Faction.THUMB, Faction.BUS, Faction.MYSTERY];
      factions.sort(() => Math.random() - 0.5);
      players = [
        { id: 'p1', name: '玩家 A', faction: factions[0], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p2', name: '玩家 B', faction: factions[1], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p3', name: '玩家 C', faction: factions[2], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p4', name: '玩家 D', faction: factions[3], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p5', name: '玩家 E', faction: factions[4], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p6', name: '玩家 F', faction: factions[5], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
      ];
    } else {
      players = [
        { id: 'p1', name: '玩家 A', faction: Faction.THUMB, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p2', name: '玩家 B', faction: Faction.BUS, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p3', name: '玩家 C', faction: Faction.THUMB, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p4', name: '玩家 D', faction: Faction.BUS, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
      ];
    }

    const deck: Card[] = [];
    const allProps = [CardProperty.TOP_SECRET, CardProperty.PRECIOUS, CardProperty.DANGER];
    for (let i = 0; i < 40; i++) {
      const shuffled = [...allProps].sort(() => Math.random() - 0.5);
      const count = Math.floor(Math.random() * 3) + 1;
      deck.push({
        id: generateId(),
        templateId: 'card_random',
        name: `情报 ${i + 1}`,
        properties: shuffled.slice(0, count),
        currentZone: Zone.DECK,
        ownerId: null,
      });
    }
    deck.sort(() => Math.random() - 0.5);

    if (mode === GameMode.RANDOM) {
      players.forEach(p => {
        for (let i = 0; i < 2; i++) {
          const c = deck.pop()!;
          c.currentZone = Zone.HAND;
          c.ownerId = p.id;
          p.hand.push(c);
        }
      });
    }

    return {
      players,
      deck,
      discard: [],
      currentPlayerIndex: 0,
      currentPhase: TurnPhase.PREP,
      passState: null,
      actionStack: [],
      dyingState: null,
      logs: [`游戏在 ${mode} 模式下初始化完成。`],
      winner: null,
      mode
    };
  }

  changePlayerFaction(playerId: string, faction: Faction) {
    const p = this.getPlayer(playerId);
    p.faction = faction;
    this.log(`GM 将 ${p.name} 的阵营修改为了 ${faction}。`);
    this.notify();
  }

  addPlayer(name?: string) {
    const idx = this.state.players.length + 1;
    const newId = `p${idx}_${generateId()}`;
    const newPlayer: Player = {
      id: newId,
      name: name || `玩家 ${String.fromCharCode(64 + idx)}`,
      faction: Faction.THUMB,
      hand: [],
      field: [],
      state: PlayerState.ALIVE,
      hasPassed: false,
    };
    this.state.players.push(newPlayer);
    this.log(`GM 添加了新玩家: ${newPlayer.name}。`);
    this.notify();
    return newPlayer;
  }

  renamePlayer(playerId: string, newName: string) {
    const p = this.getPlayer(playerId);
    const oldName = p.name;
    p.name = newName;
    this.log(`玩家 '${oldName}' 已更名为 '${newName}'。`);
    this.notify();
  }

  log(msg: string) {
    this.state.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    this.notify();
  }

  notify() {
    this.onStateChange({ ...this.state });
  }

  getPlayer(id: string) {
    return this.state.players.find(p => p.id === id)!;
  }

  getCurrentPlayer() {
    return this.state.players[this.state.currentPlayerIndex];
  }

  nextPhase() {
    if (this.state.winner) return;

    const p = this.getCurrentPlayer();
    switch (this.state.currentPhase) {
      case TurnPhase.PREP:
        this.log(`--- ${p.name} 的回合 ---`);
        this.log(`${p.name} 的 准备阶段 开始。`);
        p.hasPassed = false;
        this.state.currentPhase = TurnPhase.DRAW;
        this.nextPhase();
        break;
      case TurnPhase.DRAW:
        if (this.state.mode === GameMode.GM) {
          this.log(`${p.name} 的 抽牌阶段 开始。等待 GM 发牌... (完成后点击“进入下一阶段”)`);
          // We do not auto-draw cards anymore in GM mode. Game pauses here, GM uses panel.
          this.notify();
        } else {
          this.log(`${p.name} 的 抽牌阶段 开始。`);
          this.drawCards(p.id, 2);
          this.state.currentPhase = TurnPhase.ACTION;
          this.notify();
        }
        break;
      case TurnPhase.ACTION:
        this.log(`${p.name} 的 行动阶段 结束。进入 传递阶段。`);
        this.state.currentPhase = TurnPhase.PASS;
        this.notify();
        break;
      case TurnPhase.PASS:
        if (!p.hasPassed) {
          this.log(`错误: ${p.name} 必须在结束 传递阶段 前传递一张手牌。`);
          return;
        }
        this.log(`${p.name} 的 传递阶段 结束。进入 弃牌阶段。`);
        this.state.currentPhase = TurnPhase.CLEANUP;
        this.notify();
        break;
      case TurnPhase.CLEANUP:
        this.log(`${p.name} 的 弃牌阶段 开始。`);
        if (p.hand.length > 6) {
          this.log(`${p.name} 手牌大于6张。请等待玩家手动弃牌。`);
          this.state.discardState = {
            active: true,
            playerId: p.id,
            requiredCount: p.hand.length - 6
          };
          this.notify();
          return; // Wait for manual discard
        }
        this.state.currentPhase = TurnPhase.END;
        this.nextPhase();
        break;
      case TurnPhase.END:
        this.log(`${p.name} 的 结束阶段。`);
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
        while (this.getCurrentPlayer().state === PlayerState.DEAD) {
          this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
        }
        this.state.currentPhase = TurnPhase.PREP;
        this.nextPhase();
        break;
    }
  }

  discardCards(playerId: string, cardIds: string[]) {
    const ds = this.state.discardState;
    if (!ds || !ds.active || ds.playerId !== playerId) return;
    if (cardIds.length !== ds.requiredCount) {
      this.log(`必须准确丢弃 ${ds.requiredCount} 张手牌。`);
      return;
    }

    const p = this.getPlayer(playerId);
    cardIds.forEach(id => {
      const idx = p.hand.findIndex(c => c.id === id);
      if (idx !== -1) {
        const c = p.hand.splice(idx, 1)[0];
        c.currentZone = Zone.DISCARD;
        c.ownerId = null;
        this.state.discard.push(c);
      }
    });

    this.log(`${p.name} 丢弃了 ${cardIds.length} 张手牌。`);
    this.state.discardState = null;
    this.state.currentPhase = TurnPhase.END;
    this.nextPhase();
  }

  destroyCard(cardId: string) {
    for (const p of this.state.players) {
      let idx = p.hand.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        const c = p.hand.splice(idx, 1)[0];
        this.log(`GM 销毁了 ${p.name} 手牌中的 '${c.name}'。`);
        this.notify();
        return;
      }
      idx = p.field.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        const c = p.field.splice(idx, 1)[0];
        this.log(`GM 销毁了 ${p.name} 信物区中的 '${c.name}'。`);
        this.checkDyingState();
        this.checkWinConditions();
        this.notify();
        return;
      }
    }
  }

  transferCard(cardId: string, targetPlayerId: string, targetZone: Zone = Zone.HAND) {
    let cardToMove: Card | null = null;
    let fromPlayer: Player | null = null;

    // find card
    for (const p of this.state.players) {
      let idx = p.hand.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        cardToMove = p.hand.splice(idx, 1)[0];
        fromPlayer = p;
        break;
      }
      idx = p.field.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        cardToMove = p.field.splice(idx, 1)[0];
        fromPlayer = p;
        break;
      }
    }

    if (cardToMove && fromPlayer) {
      const target = this.getPlayer(targetPlayerId);
      cardToMove.currentZone = targetZone;
      cardToMove.ownerId = target.id;
      if (targetZone === Zone.HAND) {
        target.hand.push(cardToMove);
      } else if (targetZone === Zone.FIELD_TOKEN) {
        target.field.push(cardToMove);
      }
      this.log(`GM 将 '${cardToMove.name}' 从 ${fromPlayer.name} 转移到了 ${target.name} 的 ${targetZone === Zone.HAND ? '手牌' : '信物区'}。`);
      this.checkDyingState();
      this.checkWinConditions();
      this.notify();
    }
  }

  dealerGrantCard(playerId: string, cardName: string, properties: CardProperty[]) {
    const p = this.getPlayer(playerId);
    const card: Card = {
      id: generateId(),
      templateId: 'card_custom',
      name: cardName || 'Custom Intel',
      properties: properties.length > 0 ? properties : [CardProperty.DANGER], // fallback
      currentZone: Zone.HAND,
      ownerId: p.id,
    };
    p.hand.push(card);
    this.log(`GM 将 '${card.name}' 发给了 ${p.name}。`);
    this.checkDyingState();
    this.checkWinConditions();
    this.notify();
  }

  drawCards(playerId: string, count: number) {
    const p = this.getPlayer(playerId);
    for (let i = 0; i < count; i++) {
      if (this.state.deck.length === 0) {
        this.log('牌堆已空！');
        break;
      }
      const c = this.state.deck.pop()!;
      c.currentZone = Zone.HAND;
      c.ownerId = p.id;
      p.hand.push(c);
    }
    this.log(`${p.name} 抽取了 ${count} 张手牌。`);
  }

  initiatePass(cardId: string, method: PassMethod, targetId?: string) {
    let initiator = this.getCurrentPlayer();

    if (this.state.mode !== GameMode.GM) {
      if (this.state.currentPhase !== TurnPhase.PASS && this.state.currentPhase !== TurnPhase.ACTION) {
        this.log(`在 行动/传递 阶段之外无法发起传递。`);
        return;
      }
      if (initiator.hasPassed) {
        this.log(`${initiator.name} 本回合已经传递过情报了。`);
        return;
      }
    }

    // Find the actual player who holds the card (for GM mode flexibility)
    let cardHolder = initiator;
    let cardIndex = initiator.hand.findIndex(c => c.id === cardId);

    if (cardIndex === -1 && this.state.mode === GameMode.GM) {
      for (const p of this.state.players) {
        const idx = p.hand.findIndex(c => c.id === cardId);
        if (idx !== -1) {
          cardHolder = p;
          cardIndex = idx;
          break;
        }
      }
    }

    if (cardIndex === -1) return;

    if (this.state.mode === GameMode.GM) {
      // In GM mode, the initiator effectively becomes the person the GM clicks the card from
      initiator = cardHolder;
    }

    const card = cardHolder.hand.splice(cardIndex, 1)[0];
    card.currentZone = Zone.ACTION_STACK;

    initiator.hasPassed = true;
    this.log(`${initiator.name} 发起了一次 ${method} 传递，目标牌为 ${card.name}。`);

    let queue: string[] = [];
    if (method === PassMethod.DELIVER) {
      if (!targetId) throw new Error("DELIVER method requires a target");
      queue = [targetId];
    } else {
      // Build a full round-robin queue: all alive players except the initiator, in seat order
      const allPlayers = this.state.players;
      const n = allPlayers.length;
      const initiatorIdx = allPlayers.findIndex(p => p.id === initiator.id);
      queue = [];
      for (let step = 1; step < n; step++) {
        const candidate = allPlayers[(initiatorIdx + step) % n];
        if (candidate.state !== PlayerState.DEAD) {
          queue.push(candidate.id);
        }
      }
    }

    this.state.passState = {
      active: true,
      initiatorId: initiator.id,
      card,
      method,
      queue,
      currentTargetId: queue[0] || null
    };

    if (this.state.passState.currentTargetId) {
      this.log(`等待 ${this.getPlayer(this.state.passState.currentTargetId).name} 接收 或 拒绝。`);
    } else {
      this.resolveBoomerang();
    }
    this.notify();
  }

  acceptPass(playerId: string) {
    const pass = this.state.passState;
    if (!pass || pass.currentTargetId !== playerId) return;

    const p = this.getPlayer(playerId);
    this.log(`${p.name} 接收 了传递的情报。`);

    pass.card.currentZone = Zone.FIELD_TOKEN;
    pass.card.ownerId = p.id;
    p.field.push(pass.card);

    this.state.passState = null;
    this.checkDyingState();
    this.checkWinConditions();
    this.notify();
  }

  rejectPass(playerId: string) {
    const pass = this.state.passState;
    if (!pass || pass.currentTargetId !== playerId) return;

    const p = this.getPlayer(playerId);
    this.log(`${p.name} 拒绝 了传递的情报。`);

    pass.queue.shift();
    if (pass.queue.length > 0) {
      pass.currentTargetId = pass.queue[0];
      this.log(`传递目标转移至 ${this.getPlayer(pass.currentTargetId).name}。`);
    } else {
      this.resolveBoomerang();
    }
    this.notify();
  }

  resolveBoomerang() {
    const pass = this.state.passState;
    if (!pass) return;

    const initiator = this.getPlayer(pass.initiatorId);
    this.log(`传递队列已空！回旋飞镖触发，${initiator.name} 必须收下这张情报。`);

    pass.card.currentZone = Zone.FIELD_TOKEN;
    pass.card.ownerId = initiator.id;
    initiator.field.push(pass.card);

    this.state.passState = null;
    this.checkDyingState();
    this.checkWinConditions();
    this.notify();
  }

  checkDyingState() {
    for (const p of this.state.players) {
      if (p.state === PlayerState.DEAD) continue;

      const dangerCount = p.field.filter(c => c.properties.includes(CardProperty.DANGER)).length;
      if (dangerCount >= 3 && p.state !== PlayerState.DYING) {
        p.state = PlayerState.DYING;
        this.log(`!!! ${p.name} 拥有 3 张危险情报，进入濒死状态！!!!`);
        this.state.dyingState = {
          active: true,
          playerId: p.id
        };
      } else if (dangerCount < 3 && p.state === PlayerState.DYING) {
        p.state = PlayerState.ALIVE;
        this.log(`${p.name} 不再处于濒死状态，恢复为存活状态。`);
        if (this.state.dyingState?.playerId === p.id) {
          this.state.dyingState = null;
        }
      }
    }
  }

  confirmDeath(playerId: string) {
    const p = this.getPlayer(playerId);
    if (p.state === PlayerState.DYING) {
      p.state = PlayerState.DEAD;
      this.log(`${p.name} 已阵亡。`);
      p.hand.forEach(c => { c.currentZone = Zone.DISCARD; c.ownerId = null; this.state.discard.push(c); });
      p.field.forEach(c => { c.currentZone = Zone.DISCARD; c.ownerId = null; this.state.discard.push(c); });
      p.hand = [];
      p.field = [];
      this.state.dyingState = null;
      this.checkWinConditions();
      this.notify();
    }
  }

  checkWinConditions() {
    if (this.state.winner) return;

    const thumbPlayers = this.state.players.filter(p => p.faction === Faction.THUMB && p.state !== PlayerState.DEAD);
    for (const p of thumbPlayers) {
      const topSecretCount = p.field.filter(c => c.properties.includes(CardProperty.TOP_SECRET)).length;
      if (topSecretCount >= 3) {
        this.log(`THUMB 阵营胜利！（${p.name} 集齐了 3 张绝密情报）`);
        this.state.winner = Faction.THUMB;
        this.state.players.forEach(p => p.state = p.faction === Faction.THUMB ? PlayerState.WIN : p.state);
        this.notify();
        return;
      }
    }

    const busPlayers = this.state.players.filter(p => p.faction === Faction.BUS && p.state !== PlayerState.DEAD);
    for (const p of busPlayers) {
      const importantCount = p.field.filter(c => c.properties.includes(CardProperty.TOP_SECRET) || c.properties.includes(CardProperty.PRECIOUS)).length;
      if (importantCount >= 6) {
        this.log(`BUS 阵营胜利！（${p.name} 集齐了 6 张重要情报）`);
        this.state.winner = Faction.BUS;
        this.state.players.forEach(p => p.state = p.faction === Faction.BUS ? PlayerState.WIN : p.state);
        this.notify();
        return;
      }
    }

    const fingerPlayers = this.state.players.filter(p => p.faction === Faction.FINGER && p.state !== PlayerState.DEAD);
    for (const p of fingerPlayers) {
      const preciousCount = p.field.filter(c => c.properties.includes(CardProperty.PRECIOUS)).length;
      if (preciousCount >= 3) {
        this.log(`FINGER 阵营胜利！（${p.name} 集齐了 3 张珍贵情报）`);
        this.state.winner = Faction.FINGER;
        this.state.players.forEach(p => p.state = p.faction === Faction.FINGER ? PlayerState.WIN : p.state);
        this.notify();
        return;
      }
    }
  }
}
