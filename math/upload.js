
    // =========================================================================
    // 4. 画像アップロード & Canvas リサイズ圧縮（最大幅 1280px, JPEG 0.85）
    // =========================================================================
    function handleImageUpload(event) {
      const inputEl = event.target;
      const file = inputEl?.files?.[0];
      // P0-5: 同じ写真を再選択できるよう input.value を即リセット
      if (inputEl) inputEl.value = '';
      if (!file) return;

      const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
      if (file.size > MAX_FILE_SIZE) {
        showStatus('⚠️ 画像ファイルが大きすぎます（最大20MBまで）。別の画像を選択してください。', 'amber');
        return;
      }

      setUploadProgress(25, 'ファイルを読み込み中…');

      const reader = new FileReader();
      reader.onerror = function() {
        setUploadProgress(0, '');
        showStatus('❌ 画像ファイルの読み込みに失敗しました。もう一度お試しください。', 'red');
      };
      reader.onload = function(e) {
        setUploadProgress(55, '画像を処理中…');
        const img = new Image();
        img.onerror = function() {
          setUploadProgress(0, '');
          showStatus('❌ この画像形式は読み込めませんでした。JPEGまたはPNG画像を選択してください。', 'red');
        };
        img.onload = function() {
          try {
            setUploadProgress(80, 'サイズを最適化中…');
            const MAX_DIM = 1280;
            let width = img.width;
            let height = img.height;
            if (width > MAX_DIM || height > MAX_DIM) {
              if (width >= height) {
                height = Math.round((height * MAX_DIM) / width);
                width = MAX_DIM;
              } else {
                width = Math.round((width * MAX_DIM) / height);
                height = MAX_DIM;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            state.currentImageBase64 = dataUrl.split(',')[1];

            setUploadProgress(100, '準備完了');
            setTimeout(() => setUploadProgress(0, ''), 600);

            document.getElementById('imagePreview').src = dataUrl;
            const previewContainer = document.getElementById('imagePreviewContainer');
            previewContainer.classList.remove('hidden', 'opacity-0', 'translate-y-4');
            previewContainer.classList.add('opacity-100', 'translate-y-0');
          } catch (err) {
            setUploadProgress(0, '');
            showStatus(`❌ 画像の圧縮処理に失敗しました: ${escapeHtml(err.message)}`, 'red');
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function clearImage() {
      state.currentImageBase64 = null;
      document.getElementById('imagePreview').src = '';
      const previewContainer = document.getElementById('imagePreviewContainer');
      previewContainer.classList.add('hidden', 'opacity-0', 'translate-y-4');
      previewContainer.classList.remove('opacity-100', 'translate-y-0');
      setUploadProgress(0, '');
    }

