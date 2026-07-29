'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PREVIEW_NAME = 'scene:prefab-preview';
const PREVIEW_QUERY = 'query-prefab-preview-data';

let glPreview = null;
let glCanvas = null;
let glWidth = 0;
let glHeight = 0;

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function callPreview(funcName, ...args) {
  return Editor.Message.request('scene', 'call-preview-function', PREVIEW_NAME, funcName, ...args);
}

function decodePng(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('internal preview canvas did not return PNG data');
  return Buffer.from(match[1], 'base64');
}

async function prepare(canvas, width, height) {
  if (!glPreview) {
    const GLPreview = Editor._Module.require('PreviewExtends').default;
    glPreview = new GLPreview(PREVIEW_NAME, PREVIEW_QUERY);
    await glPreview.init({ width, height });
  }
  canvas.width = width;
  canvas.height = height;
  if (glCanvas !== canvas) {
    await glPreview.initGL(canvas, { width, height });
    glCanvas = canvas;
  }
  if (glWidth !== width || glHeight !== height) {
    await glPreview.resizeGL(width, height);
    glWidth = width;
    glHeight = height;
  }
}

module.exports = Editor.Panel.define({
  template: '<div class="root"><canvas class="preview"></canvas></div>',
  style: `
    :host, .root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
    .preview { display: block; width: 100%; height: 100%; }
  `,
  $: {
    canvas: '.preview'
  },
  methods: {
    async renderPrefab(options = {}) {
      const { uuid, output, width, height } = options;
      if (typeof uuid !== 'string' || !uuid) throw new Error('Prefab UUID is required');
      if (typeof output !== 'string' || !output) throw new Error('output path is required');
      await prepare(this.$.canvas, width, height);
      await callPreview('setPrefab', uuid);

      let is2D = await callPreview('is2DView');
      if (!is2D) {
        await callPreview('viewToggle');
        await nextFrame();
        is2D = await callPreview('is2DView');
      }
      if (!is2D) throw new Error('internal Prefab preview failed to switch to 2D mode');

      const settleFrames = Math.max(1, Math.min(30, Number(options.settleFrames) || 3));
      let previewData;
      for (let index = 0; index < settleFrames; index += 1) {
        await nextFrame();
        previewData = await glPreview.queryPreviewData({ width, height });
        glPreview.drawGL(previewData);
      }
      // Capture immediately after the final draw while the WebGL drawing buffer is valid.
      const png = decodePng(this.$.canvas.toDataURL('image/png'));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, png);
      return {
        uuid,
        url: options.url || null,
        output,
        width,
        height,
        bytes: png.length,
        renderer: PREVIEW_NAME,
        previewMode: '2D'
      };
    }
  },
  ready() {},
  close() {
    glPreview = null;
    glCanvas = null;
    glWidth = 0;
    glHeight = 0;
  }
});
