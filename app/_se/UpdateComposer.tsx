'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// 发一条同步更新：文字 + 图片 + 地点定位 + 具体时间。
// 图片先在浏览器里压到 1280px/JPEG 再传，省得在 Workers 里处理大图。
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('只支持图片文件。');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('这个浏览器无法处理图片，请换一张或换个浏览器。');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('图片压缩失败。');
  return blob;
}

export function UpdateComposer({ hasLocation }: { hasLocation: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [images, setImages] = useState<{ key: string; url: string }[]>([]);
  const [place, setPlace] = useState({ name: '', address: '', lat: '', lng: '' });
  const [startsAt, setStartsAt] = useState('');
  const [pinned, setPinned] = useState(false);
  const [showPlace, setShowPlace] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy('image');
    setError('');
    try {
      for (const file of Array.from(files).slice(0, 6 - images.length)) {
        const blob = await compress(file);
        const response = await fetch('/api/se/uploads', {
          method: 'POST',
          headers: { 'content-type': 'image/jpeg' },
          body: blob,
        });
        const payload = (await response.json()) as { ok?: boolean; key?: string; url?: string; error?: string };
        if (!response.ok || !payload.ok || !payload.key || !payload.url) {
          setError(payload.error || '图片上传失败。');
          break;
        }
        setImages((previous) => [...previous, { key: payload.key as string, url: payload.url as string }]);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '图片处理失败。');
    }
    setBusy('');
  }

  function locate() {
    if (!navigator.geolocation) {
      setError('这个浏览器不支持定位，请手填地址。');
      return;
    }
    setBusy('locate');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPlace((previous) => ({
          ...previous,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }));
        setBusy('');
      },
      () => {
        setError('取不到定位（需要允许权限且在 https 下）。可以手填地址或粘贴经纬度。');
        setBusy('');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function publish() {
    if (busy) return;
    setBusy('publish');
    setError('');
    try {
      const response = await fetch('/api/se/updates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body,
          imageKeys: images.map((image) => image.key),
          locationName: place.name,
          locationAddress: place.address,
          locationLat: place.lat,
          locationLng: place.lng,
          startsAt,
          pinned,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error || '发布失败。');
      } else {
        setBody('');
        setImages([]);
        setPlace({ name: '', address: '', lat: '', lng: '' });
        setStartsAt('');
        setPinned(false);
        setShowPlace(false);
        router.refresh();
      }
    } catch {
      setError('网络不稳，请稍后重试。');
    }
    setBusy('');
  }

  return (
    <div className="se-card">
      <h2 className="se-h2">发一条同步更新</h2>
      <p className="se-muted" style={{ marginTop: -4 }}>
        发出去之后，所有报名者打开自己的门票链接就能看到，不用重新报名、也不用再发一遍链接。
      </p>

      <label className="se-field" style={{ marginTop: 12 }}>
        <span>内容</span>
        <textarea
          className="se-textarea"
          rows={5}
          maxLength={2000}
          placeholder={'例如：\n活动具体时间定了：11月15日 周六 14:00 签到，14:30 正式开始。\n地点在下面，建议地铁 2 号线 A 口出。'}
          value={body}
          onChange={(changeEvent) => setBody(changeEvent.target.value)}
        />
      </label>

      <div className="se-field">
        <span>图片（最多 6 张）</span>
        <input
          className="se-input"
          type="file"
          accept="image/*"
          multiple
          disabled={busy === 'image' || images.length >= 6}
          onChange={(changeEvent) => addImages(changeEvent.target.files)}
        />
        {busy === 'image' ? <p className="se-hint">正在压缩上传…</p> : null}
        {images.length > 0 ? (
          <div className="se-shots" style={{ marginTop: 8 }}>
            {images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={image.key} src={image.url} alt="已上传" />
            ))}
          </div>
        ) : null}
      </div>

      <div className="se-field">
        <span>具体时间（可选）</span>
        <input
          className="se-input"
          type="datetime-local"
          value={startsAt}
          onChange={(changeEvent) => setStartsAt(changeEvent.target.value)}
        />
        <p className="se-hint">按北京时间填。只影响这条更新的展示，不改活动本身的时间。</p>
      </div>

      {showPlace ? (
        <>
          <label className="se-field">
            <span>地点名称</span>
            <input
              className="se-input"
              maxLength={80}
              placeholder="例如：市图书馆 3 楼报告厅"
              value={place.name}
              onChange={(changeEvent) => setPlace({ ...place, name: changeEvent.target.value })}
            />
          </label>
          <label className="se-field">
            <span>详细地址</span>
            <input
              className="se-input"
              maxLength={200}
              value={place.address}
              onChange={(changeEvent) => setPlace({ ...place, address: changeEvent.target.value })}
            />
          </label>
          <div className="se-field">
            <span>经纬度（可选，填了报名者就能一键导航）</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="se-input"
                placeholder="纬度 lat"
                value={place.lat}
                onChange={(changeEvent) => setPlace({ ...place, lat: changeEvent.target.value })}
              />
              <input
                className="se-input"
                placeholder="经度 lng"
                value={place.lng}
                onChange={(changeEvent) => setPlace({ ...place, lng: changeEvent.target.value })}
              />
            </div>
            <div className="se-btn-row" style={{ marginTop: 8 }}>
              <button className="se-btn se-btn--sm" type="button" onClick={locate} disabled={busy === 'locate'}>
                {busy === 'locate' ? '定位中…' : '用我当前位置'}
              </button>
            </div>
            <p className="se-hint">在现场发更新时最方便。也可以从高德/腾讯地图复制坐标粘进来。</p>
          </div>
        </>
      ) : (
        <button className="se-btn se-btn--sm se-btn--ghost" type="button" onClick={() => setShowPlace(true)}>
          {hasLocation ? '这条更新要改地点' : '加上地点定位'}
        </button>
      )}

      <label className="se-option" style={{ margin: '14px 0' }}>
        <input type="checkbox" checked={pinned} onChange={(changeEvent) => setPinned(changeEvent.target.checked)} />
        <span>置顶这条（排在最上面）</span>
      </label>

      {error ? (
        <div className="se-note se-note--danger" style={{ marginBottom: 10 }}>
          <span>{error}</span>
        </div>
      ) : null}

      <button className="se-btn se-btn--primary" type="button" onClick={publish} disabled={busy === 'publish'}>
        {busy === 'publish' ? '发布中…' : '发布更新'}
      </button>
    </div>
  );
}
