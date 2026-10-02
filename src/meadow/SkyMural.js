import * as THREE from 'three';

// Seeded RNG
function seededRNG(seed) {
  let s = seed;
  return () => {
    s = Math.sin(s) * 10000;
    return s - Math.floor(s);
  };
}

export function generateSkyMural(seed, isCeiling, widthMeters, heightMeters) {
  const texelsPerMeter = 170; // 12m * 170 = 2040px (under 2048px limit)
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthMeters * texelsPerMeter);
  canvas.height = Math.round(heightMeters * texelsPerMeter);
  const ctx = canvas.getContext('2d');
  
  const rand = seededRNG(seed);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (isCeiling) {
    bgGrad.addColorStop(0, '#1f6f8c');
    bgGrad.addColorStop(1, '#247a9e');
  } else {
    bgGrad.addColorStop(0, '#2b87b5');
    bgGrad.addColorStop(1, '#3499c7');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Clouds
  const area = widthMeters * heightMeters;
  const numClouds = Math.floor(area * (isCeiling ? 1.5 : 1.2)); 

  for (let i = 0; i < numClouds; i++) {
    const cx = rand() * canvas.width;
    const cy = rand() * canvas.height;
    
    // Cloud width between 0.8 and 2.2 meters
    const cloudWidthMeters = 0.8 + rand() * 1.4;
    const cloudWidthPx = cloudWidthMeters * texelsPerMeter;
    
    const numPuffs = 8 + Math.floor(rand() * 12);
    
    // Draw back-to-front layers
    const layers = [
      { color: isCeiling ? '#e8a5a5' : '#d79fbd', offsetY: 0.1, scaleX: 1.1, scaleY: 0.7 }, // Shadow
      { color: isCeiling ? '#ffebf0' : '#f7dfe8', offsetY: 0.0, scaleX: 1.0, scaleY: 0.85 }, // Body
      { color: '#ffffff', offsetY: -0.15, offsetX: -0.1, scaleX: 0.8, scaleY: 0.6 } // Highlight
    ];

    layers.forEach(layer => {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      
      // Seeded puff generator for consistent shapes per layer
      let puffSeed = seed + i * 100;
      const puffRand = seededRNG(puffSeed);

      for (let p = 0; p < numPuffs; p++) {
        const px = cx + (puffRand() - 0.5) * cloudWidthPx * layer.scaleX + (layer.offsetX * cloudWidthPx || 0);
        
        // Flatter bottom: restrict puff Y offset 
        const pyOffset = puffRand();
        const py = cy - (pyOffset * cloudWidthPx * 0.4) * layer.scaleY + (layer.offsetY * cloudWidthPx * 0.5);
        
        const puffRadius = (0.2 + puffRand() * 0.3) * cloudWidthPx * layer.scaleY;
        
        ctx.moveTo(px, py);
        ctx.arc(px, py, puffRadius, 0, Math.PI * 2);
      }
      ctx.fill();
    });
  }

  // Soft blur & Grain
  ctx.filter = 'blur(1px)';
  ctx.drawImage(canvas, 0, 0); // self-draw to apply blur
  ctx.filter = 'none';

  // Add 3% grain
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (rand() - 0.5) * 15;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i+1] = Math.min(255, Math.max(0, data[i+1] + grain));
    data[i+2] = Math.min(255, Math.max(0, data[i+2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Pink bounce on lower wall (walls only)
  if (!isCeiling) {
    const bounceGrad = ctx.createLinearGradient(0, canvas.height - (0.8 * texelsPerMeter), 0, canvas.height);
    bounceGrad.addColorStop(0, 'rgba(242, 167, 186, 0.0)');
    bounceGrad.addColorStop(1, 'rgba(242, 167, 186, 0.12)');
    ctx.fillStyle = bounceGrad;
    ctx.fillRect(0, canvas.height - (0.8 * texelsPerMeter), canvas.width, 0.8 * texelsPerMeter);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  
  return texture;
}
