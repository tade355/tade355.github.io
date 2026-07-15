const MAX_IMAGE_DIM = 1000;
const IMAGE_QUALITY = 0.7;
const MAX_FILE_SIZE = 1.5 * 1024 * 1024; // 1.5MB cap for non-image files (images get compressed instead)

export function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
            const scale = MAX_IMAGE_DIM / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve({ name: file.name, dataUrl: canvas.toDataURL('image/jpeg', IMAGE_QUALITY), addedAt: new Date().toISOString() });
        };
        img.onerror = () => reject(new Error(`Could not read "${file.name}" as an image.`));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
      reader.readAsDataURL(file);
    } else {
      if (file.size > MAX_FILE_SIZE) {
        reject(new Error(`"${file.name}" is too large (max 1.5MB for non-image files).`));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => resolve({ name: file.name, dataUrl: e.target.result, addedAt: new Date().toISOString() });
      reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
      reader.readAsDataURL(file);
    }
  });
}

export function createAttachmentPicker(initialAttachments = []) {
  let attachments = [...initialAttachments];

  const list = document.createElement('div');
  list.className = 'attachment-list';

  function renderList() {
    list.innerHTML = '';
    attachments.forEach((att, idx) => {
      const isImage = att.dataUrl.startsWith('data:image');
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';

      if (isImage) {
        const thumb = document.createElement('img');
        thumb.src = att.dataUrl;
        thumb.className = 'attachment-thumb';
        thumb.title = 'Click to view full size';
        thumb.addEventListener('click', () => window.open(att.dataUrl, '_blank'));
        chip.appendChild(thumb);
      }

      const nameSpan = document.createElement('span');
      nameSpan.textContent = att.name;
      nameSpan.className = 'attachment-name';
      if (!isImage) {
        nameSpan.style.cursor = 'pointer';
        nameSpan.title = 'Click to open';
        nameSpan.addEventListener('click', () => window.open(att.dataUrl, '_blank'));
      }
      chip.appendChild(nameSpan);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn icon-btn-danger';
      removeBtn.title = 'Remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        attachments.splice(idx, 1);
        renderList();
      });
      chip.appendChild(removeBtn);

      list.appendChild(chip);
    });
  }
  renderList();

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = 'image/*,application/pdf,.kml,application/vnd.google-earth.kml+xml';
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    for (const file of files) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const attachment = await fileToAttachment(file);
        attachments.push(attachment);
      } catch (err) {
        window.alert(err.message);
      }
    }
    fileInput.value = '';
    renderList();
  });

  const wrap = document.createElement('div');
  wrap.className = 'attachment-picker';
  wrap.appendChild(list);
  wrap.appendChild(fileInput);

  return { element: wrap, getAttachments: () => attachments };
}
