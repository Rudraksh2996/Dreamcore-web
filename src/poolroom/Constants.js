export const POOLROOM_BG = '#e8e6df';
export const POOLROOM_FOG = { color: '#cfe7e2', near: 6, far: 40 };

export const POOLROOM_WIDTH = 14.0;
export const POOLROOM_LENGTH = 30.0;
export const WATER_LEVEL = 0.15;
export const CHAIR_COUNT = 48; // 3 rows per side, 8 per row

// Shoreline is a diagonal curve
// Local coordinates (z from 0 to -30)
// Dry sand near the entrance (z=0) and along the left wall (x < 0).
// Water to the right (x > 0) and farther in (z < 0).
export const getShorelineZ = (x) => {
   // x is from -7 to 7.
   // At x = -7 (left wall), shore is deep into the room, e.g. z = -25. (So left wall is mostly dry).
   // At x = 7 (right wall), shore is near the entrance, e.g. z = -3. (So right side is mostly water).
   // linear: z = (x - (-7)) * ((-3 - -25) / 14) + (-25)
   // z = (x + 7) * (22 / 14) - 25 = (x + 7) * 1.571 - 25.0
   
   // Let's add a gentle curve
   const normalizedX = (x + 7.0) / 14.0; // 0 to 1
   return (normalizedX * normalizedX * 15.0 + normalizedX * 7.0) - 25.0; 
};

export const isWaterGLSL = `
float getShorelineZ(float x) {
   float nx = (x + 7.0) / 14.0;
   return (nx * nx * 15.0 + nx * 7.0) - 25.0;
}
`;
