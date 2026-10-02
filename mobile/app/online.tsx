import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { maybeShowInterstitial } from '../src/ads/ads';
import { useCosmetics } from '../src/game/cosmetics';
import { GameLayout } from '../src/game/GameLayout';
import { Banner, Countdown, GameMenu, ResultOverlay, RoundButton } from '../src/game/hud';
import { useMatch } from '../src/game/matchStore';
import { useShotPlayback } from '../src/game/playback';
import { useT, type Key } from '../src/i18n';
import { useAuth } from '../src/store/auth';
import { useConfig } from '../src/store/config';
import { useSettings } from '../src/store/settings';
import { Button, Pill, Row } from '../src/ui/kit';
import { theme } from '../src/ui/theme';

const EMOTES = ['thumbs_up', 'laugh', 'fire', 'gg', 'nice', 'oops'] as const;
const CHATS = ['good_luck', 'nice_shot', 'well_played', 'hurry_up', 'oops', 'thanks'] as const;

const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Live multiplayer match (quick match, friend game, private room, bot fill). The server is authoritative. */
export default function OnlineGame() {
  const t = useT();
  const qc = useQueryClient();
  const me = useAuth((s) => s.me);
  const ads = useConfig((s) => s.config.ads);
  const cosm = useCosmetics();
  const m = useMatch();
  const muted = useSettings((s) => s.muted);
  const toggleMute = useSettings((s) => s.toggleMute);
  const pb = useShotPlayback();
  const animating = useRef(false);
  const [powerAim, setPowerAim] = useState(false);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState<null | 'emote' | 'chat'>(null);
  const [now, setNow] = useState(Date.now());
  const [countKey, setCountKey] = useState(0);
  const [shotError, setShotError] = useState<string | null>(null);
  const myId = me?.id ?? '';

  // nothing to show without a match: go home (e.g. app restarted after the match ended)
  useEffect(() => { if (m.phase === 'idle') router.replace('/'); }, [m.phase]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  useEffect(() => { if (m.countdownMs > 0) setCountKey(m.countdownKey); }, [m.countdownKey, m.countdownMs]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setMenu(true); return true; });
    return () => sub.remove();
  }, []);

  // play queued server shots one after another, then snap to the authoritative state
  useEffect(() => {
    if (animating.current || m.pending.length === 0 || m.phase === 'idle') return;
    const msg = m.pending[0];
    const shooter = m.players.find((p) => p.userId === msg.by);
    animating.current = true;
    pb.playShot({ bodies: m.bodies, step: 0 }, (shooter?.team ?? 0) as 0 | 1, msg.shot.strikerX, msg.sim, () => { animating.current = false; m.applyShotDone(msg); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.pending, m.phase]);

  const mySlot = m.players.find((p) => p.userId === myId);
  const myTeam = (mySlot?.team ?? 0) as 0 | 1;
  const oppTeam = (myTeam === 0 ? 1 : 0) as 0 | 1;
  const opponents = m.players.filter((p) => p.team === oppTeam);
  const nameOf = (id: string) => m.profiles[id]?.username ?? '…';
  const counting = countKey !== 0 && now < countKey + m.countdownMs && m.countdownMs > 0;
  const busy = animating.current || pb.playing || m.pending.length > 0;
  const myTurn = m.phase === 'playing' && m.shooterId === myId && !m.paused && !busy && !counting && m.connected && m.away.length === 0;
  const timeLeft = m.turnEndsAt ? m.turnEndsAt - now : 0;
  const away = m.away.length > 0;

  const status = m.phase === 'finished' ? t('game.matchOver')
    : !m.connected ? t('game.reconnecting')
    : away ? t('game.disconnected')
    : m.shooterId === myId ? t('game.yourTurn')
    : t('game.waitingFor', { name: nameOf(m.shooterId ?? '') });

  const bodies = pb.bodies ?? m.bodies;
  const onShoot = async (shot: Parameters<typeof m.sendShot>[0]) => {
    const err = await m.sendShot(shot);
    if (err) { setShotError(err); setTimeout(() => setShotError(null), 1500); }
  };

  const finishedReady = m.result && m.pending.length === 0 && !pb.playing;
  const leave = async () => {
    const entry = m.queueEntry;
    void entry;
    await maybeShowInterstitial(ads, false);
    m.reset();
    qc.invalidateQueries();
    router.replace('/');
  };
  const again = () => { const entry = m.queueEntry; m.reset(); router.replace(`/matchmaking?entry=${entry}`); };

  const visibleReactions = useMemo(() => m.reactions.filter((r) => !muted.includes(r.from)), [m.reactions, muted]);
  const oppId = opponents.find((o) => !o.isBot)?.userId;
  const topName = opponents.map((o) => nameOf(o.userId)).join(' & ');

  return (
    <GameLayout
      top={{ name: topName, avatarId: m.profiles[opponents[0]?.userId ?? '']?.avatarId, imageUrl: m.profiles[opponents[0]?.userId ?? '']?.imageUrl, pocketed: m.pocketed[oppTeam], color: oppTeam === 0 ? 'white' : 'black', active: m.current === oppTeam, subtitle: m.profiles[opponents[0]?.userId ?? ''] ? `Lv ${m.profiles[opponents[0].userId].level}` : undefined }}
      bottom={{ name: me?.profile.username ?? t('common.you'), avatarId: me?.profile.avatarId, imageUrl: me?.profile.imageUrl, pocketed: m.pocketed[myTeam], color: myTeam === 0 ? 'white' : 'black', active: m.current === myTeam }}
      centerTop={<>
        <Pill color="#0006" textColor="#ffd24a">🪙 {me?.balance ?? 0}</Pill>
        <Pill color="#0006" textColor="#7fe3ff">⭐ {m.scores[myTeam]} – {m.scores[oppTeam]}</Pill>
        {m.phase === 'playing' && !counting && !away ? <Pill color={timeLeft < 8000 ? theme.red : '#0006'} textColor="#fff">⏳ {fmt(timeLeft)}</Pill> : null}
        {m.matchEndsAt ? <Pill color="#0006" textColor="#fff">⏱ {fmt(m.matchEndsAt - now)}</Pill> : null}
      </>}
      status={shotError ? shotError : status} statusTone={away || !m.connected ? 'warn' : 'normal'}
      bodies={bodies} falling={pb.falling} boardTheme={cosm.boardTheme} strikerColor={cosm.strikerColor}
      side={myTeam} canShoot={myTurn} onShoot={onShoot} hint={t('game.dragHint')} guideLimit={m.ranked ? 380 : undefined}
      powerAim={powerAim} onPowerAim={() => setPowerAim((v) => !v)}
      buttons={<>
        <RoundButton label="☰" onPress={() => setMenu(true)} />
        <RoundButton label="😀" active={panel === 'emote'} onPress={() => setPanel(panel === 'emote' ? null : 'emote')} />
        <RoundButton label="💬" active={panel === 'chat'} onPress={() => setPanel(panel === 'chat' ? null : 'chat')} />
      </>}
      floating={<>
        <Banner text={m.banner?.text ?? null} kind={m.banner?.kind} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 6, left: 6, gap: 4 }}>
          {visibleReactions.map((r) => (
            <View key={r.id} style={{ backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontWeight: '800', color: '#222' }}>{nameOf(r.from)}: {t(r.text as Key)}</Text>
            </View>
          ))}
        </View>
      </>}
      overlays={<>
        {panel && (
          <View style={{ position: 'absolute', bottom: 92, left: 12, right: 12, backgroundColor: theme.card, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: theme.border }}>
            <Row style={{ flexWrap: 'wrap' }}>
              {(panel === 'emote' ? EMOTES : CHATS).map((id) => (
                <Pressable key={id} onPress={() => { m.react(panel === 'emote' ? 'emote' : 'quick_chat', id); setPanel(null); }} style={{ backgroundColor: theme.card2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{t((panel === 'emote' ? `emote.${id}` : `chat.${id}`) as Key)}</Text>
                </Pressable>
              ))}
            </Row>
          </View>
        )}
        {counting && <Countdown key={countKey} ms={m.countdownMs} />}
        {(away || !m.connected) && m.phase === 'playing' && (
          <View pointerEvents="none" style={{ position: 'absolute', top: '38%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', padding: 16, borderRadius: 14, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{!m.connected ? t('game.reconnecting') : t('game.disconnected')}</Text>
            {m.connected && <Text style={{ color: theme.muted, marginTop: 4 }}>{t('game.reconnectIn')}</Text>}
          </View>
        )}
        <GameMenu visible={menu} onClose={() => setMenu(false)}>
          {oppId && <Button title={muted.includes(oppId) ? t('game.unmute') : t('game.mute')} kind="secondary" onPress={() => toggleMute(oppId)} />}
          {oppId && <Button title={t('game.report')} kind="secondary" onPress={() => { setMenu(false); router.push(`/report?userId=${oppId}&matchId=${m.matchId ?? ''}`); }} />}
          <Button title={t('game.resign')} kind="danger" onPress={() => { setMenu(false); m.resign(); }} />
        </GameMenu>
        {finishedReady && m.result && <ResultOverlay r={m.result} onAgain={m.mode === 'quick' || m.mode === 'bot' ? again : undefined} onHome={leave} />}
      </>}
    />
  );
}
