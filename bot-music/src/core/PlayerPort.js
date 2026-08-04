
export class PlayerManagerPort {
  constructor(playerManager, { resolveChannel } = {}) {
    this.pm = playerManager;
    this.resolveChannel = resolveChannel ?? ((ch) => ch);
  }

  playingInChannel(guildId, channelId) {
    return this.pm.playingInChannel(guildId, channelId);
  }

  currentItemId(guildId) {
    return this.pm.peek(guildId)?.current?.item?.id ?? null;
  }

  applySkip(guildId, playable, item) {
    this.pm.peek(guildId)?.applySkip(playable, item);
  }

  applyPrevious(guildId, playable, item) {
    this.pm.peek(guildId)?.applyPrevious(playable, item);
  }

  stopKeep(guildId) {
    this.pm.peek(guildId)?.stopKeep();
  }

  stopAndDisconnect(guildId) {
    return this.pm.stopAndDisconnect(guildId);
  }

  async ensureConnectedAndPlay(guildId, channelRef, playable, item) {
    const channel = this.resolveChannel(channelRef);
    if (!channel) throw new Error("voice channel ref não resolveu");
    await this.pm.get(guildId).ensureConnectedAndPlay(channel, playable, item);
  }

  async playLofi(guildId, channelRef, station) {
    const channel = this.resolveChannel(channelRef);
    if (!channel) throw new Error("voice channel ref não resolveu");
    await this.pm.get(guildId).playLofi(channel, station);
  }

  toggleDiscover(guildId) {
    return this.pm.toggleDiscover(guildId);
  }

  discoverEnabled(guildId, channelId) {
    return this.pm.discoverEnabled(guildId, channelId);
  }

  togglePause(guildId) {
    return this.pm.togglePause(guildId);
  }

  paused(guildId, channelId) {
    return this.pm.paused(guildId, channelId);
  }

  toggleStayInRoom(guildId) {
    return this.pm.toggleStayInRoom(guildId);
  }

  stayInRoom(guildId, channelId) {
    return this.pm.stayInRoom(guildId, channelId);
  }

  requestLeaveGrace(guildId) {
    this.pm.peek(guildId)?.requestLeaveGrace?.();
  }

  cancelLeaveGrace(guildId) {
    this.pm.peek(guildId)?.cancelLeaveGrace?.();
  }

  pauseForEmpty(guildId) {
    this.pm.peek(guildId)?.pauseForEmpty?.();
  }

  resumeIfAutoPaused(guildId) {
    this.pm.peek(guildId)?.resumeIfAutoPaused?.();
  }

  playbackPositionMs(guildId, channelId) {
    return this.pm.playbackPositionMs?.(guildId, channelId) ?? null;
  }
}
