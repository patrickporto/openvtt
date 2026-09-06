import { describe, expect, it } from 'bun:test';
import { ChannelMixer, DEFAULT_CHANNELS } from '../src/channels';

describe('ChannelMixer', () => {
  it('cria os canais padrão', () => {
    const mixer = new ChannelMixer();
    expect(mixer.list()).toEqual([...DEFAULT_CHANNELS]);
    expect(mixer.effective('music')).toBe(1);
  });

  it('computa volume efetivo = canal × master', () => {
    const mixer = new ChannelMixer();
    mixer.setChannelVolume('music', 0.5);
    mixer.setMasterVolume(0.5);
    expect(mixer.effective('music')).toBeCloseTo(0.25);
  });

  it('mute do canal zera o ganho', () => {
    const mixer = new ChannelMixer();
    mixer.setChannelVolume('ambient', 0.8);
    mixer.setChannelMuted('ambient', true);
    expect(mixer.channelGain('ambient')).toBe(0);
    expect(mixer.channelGain('music')).toBe(1);
  });

  it('solo silencia os demais canais', () => {
    const mixer = new ChannelMixer();
    mixer.setChannelSolo('voice', true);
    expect(mixer.channelGain('voice')).toBe(1);
    expect(mixer.channelGain('music')).toBe(0);
    expect(mixer.channelGain('ambient')).toBe(0);
    expect(mixer.anySolo()).toBe(true);
  });

  it('solo não silencia canal mutado também solado', () => {
    const mixer = new ChannelMixer();
    mixer.setChannelSolo('music', true);
    mixer.setChannelMuted('music', true);
    expect(mixer.channelGain('music')).toBe(0);
  });

  it('master mute zera o ganho global', () => {
    const mixer = new ChannelMixer();
    mixer.setMasterMuted(true);
    expect(mixer.effective('effects')).toBe(0);
  });

  it('notifica listeners em qualquer mudança', () => {
    const mixer = new ChannelMixer();
    let changes = 0;
    mixer.onChange(() => {
      changes += 1;
    });
    mixer.setChannelVolume('music', 0.5);
    mixer.setMasterMuted(true);
    mixer.setChannelSolo('voice', true);
    expect(changes).toBe(3);
  });

  it('rejeita volume inválido e canal desconhecido', () => {
    const mixer = new ChannelMixer();
    expect(() => mixer.setChannelVolume('music', 2)).toThrow();
    expect(() => mixer.setChannelVolume('nope', 0.5)).toThrow();
  });

  it('ensure cria canal custom sob demanda', () => {
    const mixer = new ChannelMixer();
    expect(mixer.get('critters')).toBeUndefined();
    expect(mixer.ensure('critters')).toMatchObject({ volume: 1, muted: false, solo: false });
    expect(mixer.list()).toContain('critters');
  });
});
