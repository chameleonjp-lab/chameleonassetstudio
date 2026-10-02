export function buildRichDistributionExample(target: 'canvas2d' | 'pixijs' | 'phaser'): string {
  const library =
    target === 'pixijs'
      ? '<script src="https://cdn.jsdelivr.net/npm/pixi.js@8.12.0/dist/pixi.min.js"></script>'
      : target === 'phaser'
        ? '<script src="https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js"></script>'
        : '';
  const adapter = target === 'canvas2d' ? 'Canvas' : target === 'pixijs' ? 'Pixi' : 'Phaser';
  const create =
    target === 'canvas2d'
      ? `const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; stage.append(canvas);
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      const player = createCanvasDistribution({ ...loaded, context, position });
      let previous, handle;
      player.start();
      const tick = (now) => { const delta = previous === undefined ? 0 : now-previous; previous=now; context.clearRect(0,0,width,height); player.advance(delta); handle=requestAnimationFrame(tick); };
      handle=requestAnimationFrame(tick);
      cleanup=()=>{cancelAnimationFrame(handle);player.dispose();};`
      : target === 'pixijs'
        ? `if (PIXI.VERSION !== '8.12.0') throw new Error('Unexpected PixiJS version');
      const app = new PIXI.Application(); await app.init({ width, height, backgroundAlpha:0, antialias:false, resolution:1 }); stage.append(app.canvas);
      const sprite = new PIXI.Sprite(); app.stage.addChild(sprite);
      const player = createPixiDistribution({ ...loaded, PIXI, sprite, position }); player.start();
      app.ticker.add(t => player.advance(t.deltaMS)); cleanup=()=>{player.dispose();app.destroy(true);};`
        : `if (Phaser.VERSION !== '4.2.0') throw new Error('Unexpected Phaser version');
      let player; const game = new Phaser.Game({type:Phaser.AUTO,width,height,parent:stage,transparent:true,pixelArt:true,
        scene:{create(){const sprite=this.add.sprite(0,0,'__WHITE');player=createPhaserDistribution({...loaded,scene:this,sprite,keyPrefix:'rich-'+sequence,position});player.start();},update(_time,delta){player?.advance(delta);}}});
      cleanup=()=>{player?.dispose();game.destroy(true);};`;
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chameleon ${target} preview</title>
<style>body{font-family:sans-serif;margin:16px}canvas{max-width:100%;height:auto;image-rendering:pixelated}button,select{font-size:16px;min-height:44px}#status{white-space:pre-wrap}</style>
<h1>${target} 配布素材の見本</h1><p>HTTPSまたはPCのlocalhostで開いてください。イベントはデータとして受け取り、自動実行しません。</p><label>素材 <select id="asset"></select></label><p id="status">読み込み中</p><div id="stage"></div>${library}
<script type="module">
import {loadRichPackage} from '../helpers/distributionManifestV2.js';
import {create${adapter}Distribution} from '../helpers/distribution${adapter}.js';
const status=document.querySelector('#status'), select=document.querySelector('#asset'),stage=document.querySelector('#stage');
let cleanup=()=>{}, sequence=0, disposed=false;
const controller=new AbortController();
try {
 if(!globalThis.crypto?.subtle) throw new Error('画像の照合にはHTTPSが必要です。PCではlocalhostも使えます。');
 const pkg=await loadRichPackage('../package-manifest.json',{signal:controller.signal});
 pkg.assets.forEach((loaded,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+'. '+pkg.packageManifest.assets[index].name;select.append(option);});
 async function show(){const token=++sequence;select.disabled=true;cleanup();stage.replaceChildren();
  try{const loaded=pkg.assets[Number(select.value)]; const first=loaded.manifest.frames[0]; const width=first.sourceSize.width,height=first.sourceSize.height,position={...first.origin};
   ${create}
   if(disposed||token!==sequence){cleanup();return;} status.textContent='読み込み成功: '+(Number(select.value)+1)+'. '+pkg.packageManifest.assets[Number(select.value)].name;
  }catch(error){status.textContent=String(error);}finally{select.disabled=false;}
 }
 select.addEventListener('change',show);await show();
 window.addEventListener('pagehide',()=>{disposed=true;sequence++;controller.abort();cleanup();pkg.dispose();},{once:true});
}catch(error){status.textContent=String(error);}
</script></html>`;
}
