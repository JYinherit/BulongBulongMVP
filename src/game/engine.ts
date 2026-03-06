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
        { id: 'p1', name: 'Player A', faction: factions[0], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p2', name: 'Player B', faction: factions[1], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p3', name: 'Player C', faction: factions[2], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p4', name: 'Player D', faction: factions[3], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p5', name: 'Player E', faction: factions[4], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p6', name: 'Player F', faction: factions[5], hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
      ];
    } else {
      players = [
        { id: 'p1', name: 'Player A', faction: Faction.THUMB, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p2', name: 'Player B', faction: Faction.BUS, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p3', name: 'Player C', faction: Faction.THUMB, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
        { id: 'p4', name: 'Player D', faction: Faction.BUS, hand: [], field: [], state: PlayerState.ALIVE, hasPassed: false },
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
        name: `Intel ${i + 1}`,
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
      logs: ['Game initialized in ' + mode + ' mode.'],
      winner: null,
      mode
    };
  }

  changePlayerFaction(playerId: string, faction: Faction) {
    const p = this.getPlayer(playerId);
    p.faction = faction;
    this.log(`GM changed ${p.name}'s faction to ${faction}.`);
    this.notify();
  }

  renamePlayer(playerId: string, newName: string) {
    const p = this.getPlayer(playerId);
    const oldName = p.name;
    p.name = newName;
    this.log(`Player '${oldName}' renamed to '${newName}'.`);
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
        this.log(`--- ${p.name}'s Turn ---`);
        this.log(`${p.name} PREP phase starts.`);
        p.hasPassed = false;
        this.state.currentPhase = TurnPhase.DRAW;
        this.nextPhase();
        break;
      case TurnPhase.DRAW:
        if (this.state.mode === import('./types').GameMode.GM) {
          this.log(`${p.name} DRAW phase starts. Waiting for GM to deal cards... (Click Next Phase when done)`);
          // We do not auto-draw cards anymore in GM mode. Game pauses here, GM uses panel.
          this.notify();
        } else {
          this.log(`${p.name} DRAW phase starts.`);
          this.drawCards(p.id, 2);
          this.state.currentPhase = TurnPhase.ACTION;
          this.notify();
        }
        break;
      case TurnPhase.ACTION:
        this.log(`${p.name} ACTION phase ends. Moving to PASS phase.`);
        this.state.currentPhase = TurnPhase.PASS;
        this.notify();
        break;
      case TurnPhase.PASS:
        if (!p.hasPassed) {
          this.log(`Error: ${p.name} must pass a card before ending PASS phase.`);
          return;
        }
        this.log(`${p.name} PASS phase ends. Moving to CLEANUP phase.`);
        this.state.currentPhase = TurnPhase.CLEANUP;
        this.notify();
        break;
      case TurnPhase.CLEANUP:
        this.log(`${p.name} CLEANUP phase starts.`);
        if (p.hand.length > 6) {
          this.log(`${p.name} has more than 6 cards. Waiting for manual discard.`);
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
        this.log(`${p.name} END phase.`);
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
      this.log(`Must discard exactly ${ds.requiredCount} cards.`);
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

    this.log(`${p.name} discarded ${cardIds.length} cards.`);
    this.state.discardState = null;
    this.state.currentPhase = TurnPhase.END;
    this.nextPhase();
  }

  destroyCard(cardId: string) {
    for (const p of this.state.players) {
      let idx = p.hand.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        const c = p.hand.splice(idx, 1)[0];
        this.log(`GM destroyed card '${c.name}' from ${p.name}'s hand.`);
        this.notify();
        return;
      }
      idx = p.field.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        const c = p.field.splice(idx, 1)[0];
        this.log(`GM destroyed card '${c.name}' from ${p.name}'s field.`);
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
      this.log(`GM transferred card '${cardToMove.name}' from ${fromPlayer.name} to ${target.name}'s ${targetZone === Zone.HAND ? 'hand' : 'field'}.`);
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
    this.log(`GM dealt '${card.name}' to ${p.name}.`);
    this.checkDyingState();
    this.checkWinConditions();
    this.notify();
  }

  drawCards(playerId: string, count: number) {
    const p = this.getPlayer(playerId);
    for (let i = 0; i < count; i++) {
      if (this.state.deck.length === 0) {
        this.log('Deck is empty!');
        break;
      }
      const c = this.state.deck.pop()!;
      c.currentZone = Zone.HAND;
      c.ownerId = p.id;
      p.hand.push(c);
    }
    this.log(`${p.name} drew ${count} cards.`);
  }

  initiatePass(cardId: string, method: PassMethod, targetId?: string) {
    let initiator = this.getCurrentPlayer();

    if (this.state.mode !== GameMode.GM) {
      if (this.state.currentPhase !== TurnPhase.PASS && this.state.currentPhase !== TurnPhase.ACTION) {
        this.log(`Cannot pass outside of ACTION/PASS phase.`);
        return;
      }
      if (initiator.hasPassed) {
        this.log(`${initiator.name} has already passed a card this turn.`);
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
    this.log(`${initiator.name} initiates a ${method} pass with card ${card.name}.`);

    let queue: string[] = [];
    if (method === PassMethod.DELIVER) {
      if (!targetId) throw new Error("DELIVER method requires a target");
      queue = [targetId];
    } else {
      const idx = this.state.currentPlayerIndex;
      const n = this.state.players.length;
      queue = [
        this.state.players[(idx + 1) % n].id,
        this.state.players[(idx + 2) % n].id,
        this.state.players[(idx + 3) % n].id,
      ].filter(id => this.getPlayer(id).state !== PlayerState.DEAD);
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
      this.log(`Waiting for ${this.getPlayer(this.state.passState.currentTargetId).name} to ACCEPT or REJECT.`);
    } else {
      this.resolveBoomerang();
    }
    this.notify();
  }

  acceptPass(playerId: string) {
    const pass = this.state.passState;
    if (!pass || pass.currentTargetId !== playerId) return;

    const p = this.getPlayer(playerId);
    this.log(`${p.name} ACCEPTED the pass.`);

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
    this.log(`${p.name} REJECTED the pass.`);

    pass.queue.shift();
    if (pass.queue.length > 0) {
      pass.currentTargetId = pass.queue[0];
      this.log(`Pass moves to ${this.getPlayer(pass.currentTargetId).name}.`);
    } else {
      this.resolveBoomerang();
    }
    this.notify();
  }

  resolveBoomerang() {
    const pass = this.state.passState;
    if (!pass) return;

    const initiator = this.getPlayer(pass.initiatorId);
    this.log(`Pass queue empty! BOOMERANG triggered. ${initiator.name} must receive the card.`);

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
        this.log(`!!! ${p.name} has 3 DANGER cards and enters DYING state! !!!`);
        this.state.dyingState = {
          active: true,
          playerId: p.id
        };
      } else if (dangerCount < 3 && p.state === PlayerState.DYING) {
        p.state = PlayerState.ALIVE;
        this.log(`${p.name} is no longer DYING and returns to ALIVE state.`);
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
      this.log(`${p.name} has DIED.`);
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
        this.log(`THUMB faction wins! (${p.name} collected 3 TOP_SECRET)`);
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
        this.log(`BUS faction wins! (${p.name} collected 6 IMPORTANT cards)`);
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
        this.log(`FINGER faction wins! (${p.name} collected 3 PRECIOUS)`);
        this.state.winner = Faction.FINGER;
        this.state.players.forEach(p => p.state = p.faction === Faction.FINGER ? PlayerState.WIN : p.state);
        this.notify();
        return;
      }
    }
  }
}
