# Fur remix (clean reimplementation; original AI Studio source not accessed)
Open via `python3 -m http.server` then index.html. Shell-textured fur (InstancedMesh, one instance per shell, gl_InstanceID = shell height),
Kajiya-Kay strand shading, per-root damped-spring tip offset (CPU, semi-implicit Euler, auto substeps so dt*sqrt(k) <= 0.5),
surface-collision clamp (normal component >= -0.8L) and length clamp (|offset| <= 1.2L). Window.__furStats exposes fps/simMs/NaN.
Controls: density 50-600 (260), length 0.02-0.5 (0.18), shells 8-96 (48), stiffness 5-400 (80), damping 0.5-30 (6), gravity 0-20 (9.8),
wind 0-30 (4), wind dir 0-360 (30), turbulence 0-1 (0.5), thickness 0.1-0.9 (0.55), push 0-80 (30), radius 0.05-1 (0.35), droop exp 1-3 (2).
