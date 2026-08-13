(function patchBotSpawnSpacing() {
  if (typeof Game === 'undefined' || !Game.prototype || !Game.prototype.reset) return;
  const origReset = Game.prototype.reset;
  Game.prototype.reset = function () {
    origReset.call(this);
    if (!this.player || !this.buildings || typeof createBot !== 'function') return;
    const ppos = { x: this.player.x, y: this.player.y };
    this.bots = [];
    for (let i = 0; i < WORLD.botCount; i++) {
      this.bots.push(createBot(this.buildings, ppos, this.bots));
    }
  };
})();
