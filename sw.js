// 旧ルートSWの後始末用。
// 旧・数学アプリ(scope "/")としてインストールされた端末が更新チェックに来た時だけ動作する。
// 役目: amt- キャッシュの削除 → 自分自身の登録解除。
// 注意: このファイルは2リリース(約2〜3ヶ月)後に削除してよい。
//       それまでは削除しないこと(404になると旧SWが残留する)。
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('amt-')).map((k) => caches.delete(k))
    );
    await self.registration.unregister();
  })());
});
