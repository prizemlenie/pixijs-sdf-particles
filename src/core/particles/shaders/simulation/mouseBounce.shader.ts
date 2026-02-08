const mouseBounceShader = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;

#define MIN_PARTICLE_MASS 0.3

uniform float uMassMultiplier;
uniform float uForceAmplitude;
uniform float uDampAmplitude;
uniform vec2 uResolution;

uniform float uGlobalDamping;
uniform float dt;

uniform vec2 uMousePos; // sim units
uniform float uMouseForceRadius; // Mouse force radius (in sim coordinates)
uniform float uMouseForceAmplitude; // Mouse force amplitude
uniform float uMouseForcePow; // Mouse force falloff exponent

uniform float uPhase; // Animation phase, physics in shader starts working at third phase

uniform sampler2D uParticlesState; // Movement texture (position.xy, velocity.zw)
uniform sampler2D uBounceMovement;
uniform sampler2D uAttributes; // Attributes texture (initStart, initEnd, orbit, mass)

void main() {
    vec4 particleStateReference = texture(uParticlesState, vUV);
    if (uPhase < 3.0) {
        // During initialization just copy state from main simulation
        finalColor = vec4(particleStateReference.xy, particleStateReference.zw);
        return;
    }

    float particleMass = max(texture(uAttributes, vUV).a, MIN_PARTICLE_MASS);
    vec2 eqilibriumPos = particleStateReference.xy;
    vec4 particleState = texture(uBounceMovement, vUV);

    vec2 particlePos = particleState.xy;
    vec2 particleVel = particleState.zw;
    
    // Force towards equilibrium point
    vec2 toEquilibrium = eqilibriumPos - particlePos;
    float distToEquilibrium = length(toEquilibrium);
    vec2 n_toEquilibrium = toEquilibrium / max(distToEquilibrium, 1e-6);

    vec2 F_equilibrium = toEquilibrium * uForceAmplitude;

    // Damping force along direction to equilibrium point
    vec2 F_damp = dot(particleVel, n_toEquilibrium) * n_toEquilibrium * -uDampAmplitude;

    // Force from mouse
    vec2 toMouse = uMousePos - particlePos;
    float distToMouse = length(toMouse);
    vec2 n_toMouse = toMouse / max(distToMouse, 1e-6);
    float mouseForceMagnitude = uMouseForceAmplitude * pow(max(0.0, 1.0 - distToMouse / uMouseForceRadius), uMouseForcePow);
    vec2 F_mouse = n_toMouse * -mouseForceMagnitude;

    // Total force
    vec2 F_total = F_equilibrium + F_damp + F_mouse;

    // Acceleration
    vec2 acceleration = F_total / (particleMass * uMassMultiplier);

    float dtSec = dt / 1000.0; // dt in seconds
    
    // Integration
    particleVel += acceleration * dtSec;

    // Exponential global damping
    particleVel *= exp(-uGlobalDamping * dtSec);
    particlePos += particleVel * dtSec;

     // Blend two simulations for smooth transition
    vec2 finalPos = mix(particleStateReference.xy, particlePos, clamp(uPhase - 3.0, 0.0, 1.0));
    vec2 finalVel = mix(particleStateReference.zw, particleVel, clamp(uPhase - 3.0, 0.0, 1.0));

    finalColor = vec4(finalPos, finalVel);
}
`;

export default mouseBounceShader;
