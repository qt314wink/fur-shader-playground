export const vert = /* glsl */`
in vec3 offset; in vec3 comb;
uniform float uLen,uShells,uDroop;
out float h; out vec2 vUv; out vec3 vT,vN,vW;
void main(){
  h=(float(gl_InstanceID)+0.5)/uShells; vec3 n=normalize(normal); vec3 d=offset+comb;
  float w=pow(h,uDroop); vec3 p=position+n*uLen*h+d*w; vUv=uv;
  vN=normalize(mat3(modelMatrix)*n);
  vT=normalize(mat3(modelMatrix)*(n*uLen+d*uDroop*pow(h,uDroop-1.)+1e-5*n));
  vec4 wp=modelMatrix*vec4(p,1.); vW=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp;}`;
export const frag = /* glsl */`
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
in float h; in vec2 vUv; in vec3 vT,vN,vW;
uniform float uDensity,uThick,uClump,uFrizz,uLenVar,uPattern,uPScale,uPContrast,uJitter,uSmooth,uSheen,uShift,uIrid,uFilm,uRim;
uniform vec3 uRoot,uTip,uAccent,uL1,uL2;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 hash2(vec2 p){return vec2(hash(p),hash(p+19.19));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p*=2.03;a*=.5;}return s;}
float patternMask(vec2 uv){
  vec2 q=uv*vec2(2.,1.)*uPScale;
  if(uPattern<.5) return 0.;
  if(uPattern<1.5) return smoothstep(.35,.75,sin(q.x*1.3+fbm(q*.7)*4.));            // tabby stripes
  if(uPattern<2.5){vec2 c=floor(q),f=fract(q);float m=0.;
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j);vec2 o=hash2(c+g);
      float d=length(g+o*.7-f);float r=.25+.15*hash(c+g+3.);
      m=max(m,smoothstep(r,r-.08,d)-smoothstep(r*.55,r*.4,d)*.85);}return m;}       // leopard rosettes
  if(uPattern<3.5) return 0.;
  return smoothstep(.3,.7,.5+.5*sin(q.x*.6+fbm(q*.5)*6.));                          // marble
}
vec3 thinFilm(float cosT){ float d=uFilm*cosT; return .5+.5*cos(12.566*(d/vec3(650.,530.,440.)));}
void main(){
  vec2 g=vUv*vec2(uDensity*2.,uDensity); vec2 c=floor(g); float r1=hash(c),r2=hash(c+7.3),r3=hash(c+13.1);
  float len=1.-uLenVar*r1;                                       // per-strand length jitter
  vec2 l=fract(g)-.5;
  vec2 cc=(fract(g/4.)-.5)*4.;                                   // position inside a 4x4 clump
  vec2 frz=(hash2(c+floor(h*6.))-.5)*uFrizz*h*.6;                // frizz
  float rad=uThick*.5*(1.-h/len);                                // tip taper
  float dist=length(l+cc*uClump*h*.35+frz);                      // clumping pulls strands toward clump centre
  float alpha=1.;
  if(h>0.02){ if(h>len) discard; alpha=smoothstep(rad,rad*.55,dist); if(alpha<.03) discard; }
  float m=patternMask(vUv)*uPContrast;
  vec3 base=mix(uRoot,uTip,smoothstep(0.,1.,h/len));
  if(uPattern>2.5&&uPattern<3.5) base=mix(uRoot,uTip,.5+.5*sin(vUv.x*uPScale*3.+h*2.));
  base=mix(base,uAccent,m);
  base*=1.+(vec3(r1,r2,r3)-.5)*2.*uJitter;                       // per-strand colour jitter
  vec3 T=normalize(vT),N=normalize(vN),V=normalize(cameraPosition-vW);
  float ao=mix(.15,1.,pow(h,.8));                                // shell-depth self-shadow
  float expo=mix(8.,240.,uSmooth*uSmooth);
  vec3 film=thinFilm(abs(dot(N,V)));
  vec3 col=vec3(0);
  for(int i=0;i<2;i++){vec3 L=i==0?uL1:uL2; float Li=i==0?1.:.35;
    float tl=dot(T,L); float diff=mix(.25,1.,sqrt(max(0.,1.-tl*tl)))*max(.15,dot(N,L)*.5+.5);
    vec3 H=normalize(L+V); vec3 T1=normalize(T+N*uShift), T2=normalize(T-N*uShift*2.);
    float t1=dot(T1,H),t2=dot(T2,H);
    float s1=pow(sqrt(max(0.,1.-t1*t1)),expo);                   // primary (R) lobe, white / film tinted
    float s2=pow(sqrt(max(0.,1.-t2*t2)),expo*.35)*.5;            // secondary (TRT) lobe, base tinted
    col+=Li*(base*diff + uSheen*(mix(vec3(1.),film,uIrid)*s1 + base*s2)*smoothstep(0.,.3,h));}
  col+=pow(1.-max(0.,dot(N,V)),3.)*uRim*mix(uTip,film,uIrid)*h;  // rim light
  col+=uIrid*film*.25*h*uSheen;
  col*=ao;
  gl_FragColor=vec4(col,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
