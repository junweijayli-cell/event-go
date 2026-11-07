'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Outcome = {
  ok?: boolean;
  result?: string;
  message?: string;
  name?: string;
  phoneTail?: string;
  inviterName?: string;
  checkedInAt?: string;
  firstCheckedInBy?: string;
  error?: string;
};

// 核销台。三条路：
//   1. 手输 6 位核销码（最稳，任何环境都能用）；
//   2. 摄像头连续扫码（只在支持 BarcodeDetector 的浏览器上出现，
//      iOS 微信里不支持，所以那边走第 3 条）；
//   3. 微信「扫一扫」直接打开票上的 /v/<token> 网址（不在这个组件里）。
export function CheckinConsole() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef('');

  // 离开页面时把摄像头关掉。不在这里探测能力：服务端渲染没有 window，
  // 用 effect 回写 state 会多一轮渲染，改成点击时再判。
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  async function send(payload: Record<string, string>) {
    setBusy(true);
    try {
      const response = await fetch('/api/se/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as Outcome;
      setOutcome(data);
      if (data.ok && navigator.vibrate) navigator.vibrate(60);
      router.refresh();
    } catch {
      setOutcome({ error: '网络不稳，请重试。' });
    }
    setBusy(false);
  }

  function stopScan() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScan() {
    setScanError('');
    // iOS 微信内置浏览器两样都不支持，直接说清楚该走哪条路。
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      setScanError('这个浏览器不支持网页内连续扫码（iOS 微信里就不支持）。请用微信「扫一扫」扫票上的二维码，或手输 6 位核销码。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      // @ts-expect-error BarcodeDetector 还不在 TS 的 lib.dom 里
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const found = await detector.detect(video);
          const raw = found?.[0]?.rawValue as string | undefined;
          if (raw) {
            const match = /\/v\/([A-Z0-9]{12,})/i.exec(raw);
            const token = match?.[1];
            if (token && token !== lastRef.current) {
              lastRef.current = token;
              await send({ ticketToken: token });
              // 同一张票 3 秒内不重复提交，免得一直停在镜头里反复核销
              setTimeout(() => {
                lastRef.current = '';
              }, 3000);
            }
          }
        } catch {
          /* 单帧识别失败就跳过 */
        }
        if (streamRef.current) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {
      setScanError('打不开摄像头。请改用微信「扫一扫」扫票上的二维码，或手输 6 位核销码。');
      stopScan();
    }
  }

  return (
    <div className="se-card">
      <h2 className="se-h2">核销台</h2>
      <div className="se-note" style={{ marginBottom: 12 }}>
        <span>
          <b>最快的方式：</b>
          用微信「扫一扫」直接扫报名者门票上的二维码，会自动跳到核销确认页。
          这台手机只要打开过你的管理链接就行。
        </span>
      </div>

      <label className="se-field">
        <span>手输 6 位核销码</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="se-input"
            inputMode="numeric"
            maxLength={6}
            placeholder="例如 418203"
            value={code}
            onChange={(changeEvent) => setCode(changeEvent.target.value.replace(/\D/g, ''))}
          />
          <button
            className="se-btn se-btn--sm se-btn--primary"
            type="button"
            disabled={busy || code.length !== 6}
            onClick={() => send({ checkinCode: code })}
          >
            核销
          </button>
        </div>
        <p className="se-hint">报名者门票页上大号数字那一串。网络差或扫码失败时用这个。</p>
      </label>

      <div className="se-field">
        <span>摄像头连续扫码</span>
        {scanning ? (
          <>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000' }} />
            <button className="se-btn se-btn--sm se-btn--ghost" type="button" onClick={stopScan} style={{ marginTop: 8 }}>
              停止扫码
            </button>
          </>
        ) : (
          <button className="se-btn se-btn--sm" type="button" onClick={startScan}>
            打开摄像头
          </button>
        )}
        {scanError ? <p className="se-hint">{scanError}</p> : null}
      </div>

      {outcome ? (
        <div
          className={`se-note ${
            outcome.ok ? 'se-note--ok' : outcome.result === 'duplicate' ? 'se-note--warn' : 'se-note--danger'
          }`}
        >
          <span>
            <b>
              {outcome.ok
                ? `✓ ${outcome.name} 已入场`
                : outcome.result === 'duplicate'
                  ? `${outcome.name} 这张票已经核销过`
                  : '无法核销'}
            </b>
            <br />
            {outcome.error || outcome.message}
            {outcome.ok && outcome.inviterName ? `（邀请人 ${outcome.inviterName}）` : ''}
            {outcome.result === 'duplicate' && outcome.checkedInAt ? (
              <>
                <br />
                首次核销 {outcome.checkedInAt}
                {outcome.firstCheckedInBy ? ` · 操作人 ${outcome.firstCheckedInBy}` : ''}
              </>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
