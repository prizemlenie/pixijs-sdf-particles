const simSpaceConversionShader = /* glsl */ `
uniform float uS; // Size of one simulation unit in pixels
uniform vec2 uSimResolution; // Resolution of simulation render

vec2 simToPx(vec2 sim) { return sim * uS + 0.5 * uSimResolution; }
vec2 pxToSim(vec2 px)  { return (px - 0.5 * uSimResolution) / uS; }

vec2 pxToUv(vec2 px)   { return px / uSimResolution; }
vec2 uvToPx(vec2 uv)   { return uv * uSimResolution; }
vec2 simToUv(vec2 sim) { return pxToUv(simToPx(sim)); }
vec2 uvToSim(vec2 uv)  { return pxToSim(uvToPx(uv)); }
`;

export default simSpaceConversionShader;
