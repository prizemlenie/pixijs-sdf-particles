import simSpaceConversionShader from '../utils/simSpaceConversion.shader';
import sampleSdfShader from '../utils/sampleSdf.shader';

/**
 * Vertex shader for rendering particles via instancing.
 *
 * Logic:
 * - Each instance is a quad (4 vertices, 2 triangles)
 * - From gl_InstanceID we calculate UV for reading position from simulation texture
 * - We read particle position from movement texture (RG channels)
 * - We read particle attributes from attributes texture
 * - We offset quad vertices to particle position
 */
const particleVertexShader = /* glsl */ `#version 300 es
precision highp float;

in vec2 aPosition;      // Local vertex coordinates of quad [-0.5, 0.5]
in vec2 aUV;            // UV coordinates for gradient

out vec2 vUV;
out float vAlpha;
out float vOrbit;

uniform sampler2D uMovementTexture;     // Movement texture (RG = position, BA = velocity)
uniform sampler2D uAttributesTexture;   // Attributes texture (R = initPeriod, G = mass, B = orbit, A = size)
uniform sampler2D uNoiseTexture;
uniform vec2 uParticleTexSize;          // Particle simulation texture size
uniform vec2 uResolution;               // Target render texture size
uniform float uMinSize;                 // Minimum particle size in UV units
uniform float uMaxSize;                 // Maximum particle size in UV units
uniform float uPhase;               // Current initialization phase (0..1)
uniform float uMinAlpha;                // Minimum particle alpha (to prevent full transparency)
uniform float sdfResolutionMultiplier;  // Multiplier for correct SDF texture sampling (considering their reduced resolution)
uniform float uOrbitMultiplier;         // Multiplier for orbital parameter calculation
uniform float uOrbitOffset;             // Offset for orbital parameter
uniform vec4 uShakeAmplitude;            // Shake amplitude for each letter
uniform float uTime;
uniform float uParticleSizeMultiplier;  

${simSpaceConversionShader}
${sampleSdfShader}

void main() {
    // Calculate UV for reading from simulation texture by instance ID
    int instanceID = gl_InstanceID;
    int texWidth = int(uParticleTexSize.x);
    int x = instanceID % texWidth;
    int y = instanceID / texWidth;
    vec2 particleUV = (vec2(float(x), float(y)) + 0.5) / uParticleTexSize;
    
    // Read particle data from movement texture
    vec4 movementData = texture(uMovementTexture, particleUV);
    vec2 particlePosSim = movementData.rg;  // Position in simulation units
    
    // Read particle attributes
    vec4 attributes = texture(uAttributesTexture, particleUV);
    float initPeriodStart = attributes.r;    // Initialization period (0..1)
    float initPeriodEnd = attributes.g;    // Initialization period (0..1)
    float sizeNorm = attributes.a;      // Normalized size (0..1)
    vOrbit = attributes.b;          // Orbital parameter (used for color variation)
    float orbitPosSim = uOrbitMultiplier * (vOrbit + uOrbitOffset);
    
    // Calculate particle size in UV units
    float particleSizeUV = mix(uMinSize, uMaxSize, sizeNorm) * uParticleSizeMultiplier;
    
    // Convert position from simulation units to UV
    vec2 particlePosUV = simToUv(particlePosSim);
    
    // Calculate transparency: alpha = initPhase / particleInitializationPeriod
    // Clamp to maximum value of 1.0
    // When initPeriod is close to 0, consider alpha = 0 (particle invisible before animation starts)
    float alpha = clamp((uPhase - initPeriodStart) / (initPeriodEnd - initPeriodStart), 0.0, 1.0);
    // Scale particle size considering target texture aspect ratio
    // Particles should be square, so we correct by X or Y
    float aspectRatio = uResolution.x / uResolution.y;
    vec2 scaledSize = vec2(particleSizeUV, particleSizeUV * aspectRatio);
    
    // Calculate vertex position
    // particlePosUV in [0, 1] -> NDC [-1, 1]
    vec2 ndcPos = particlePosUV * 2.0 - 1.0;
    // Vertex offset considering size (aPosition in [-0.5, 0.5])
    vec2 vertexOffset = aPosition * scaledSize * 2.0;
    
    vec2 shake = (texture(uNoiseTexture, particleUV * 10.0 + vec2(0.0, uTime * 0.0005)).rg - 0.5) * 2.0;
    vec2 finalPos = ndcPos + vertexOffset + shake * uShakeAmplitude[instanceID % 4];
    
    gl_Position = vec4(finalPos, 0.0, 1.0);

    float sdfDistSim = sampleSdf(instanceID % 4, simToUv(particlePosSim)).z / (sdfResolutionMultiplier * uS);
    float distFromOrbit = clamp(sdfDistSim - orbitPosSim, 0.0, 1.0); 
    alpha *= 1.0 - smoothstep(0.01, 0.45, distFromOrbit);
    alpha *= 1.0;
    
    vUV = aUV;
    vAlpha = alpha;
}
`;

export default particleVertexShader;
