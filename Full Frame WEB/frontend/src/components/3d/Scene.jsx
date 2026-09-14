import { Canvas } from '@react-three/fiber';
import { Float, Preload } from '@react-three/drei';

function FloatingObjects() {
  return (
    <group>
      {/* Sleek floating cards positioned on outer flanks to frame the page with zero text obstruction */}
      <Float speed={1.6} rotationIntensity={0.8} floatIntensity={1.2}>
        <mesh position={[-4.8, 0.5, -2.2]} rotation={[0.2, 0.35, -0.1]}>
          <boxGeometry args={[1.5, 2.1, 0.05]} />
          <meshStandardMaterial 
            color="#0d9488" 
            roughness={0.25} 
            metalness={0.6}
            transparent={true}
            opacity={0.5}
          />
        </mesh>
      </Float>

      <Float speed={1.3} rotationIntensity={0.9} floatIntensity={1.0}>
        <mesh position={[4.8, 0.3, -2.0]} rotation={[-0.2, -0.4, 0.15]}>
          <boxGeometry args={[1.7, 2.3, 0.05]} />
          <meshStandardMaterial 
            color="#14b8a6" 
            roughness={0.2} 
            metalness={0.5}
            transparent={true}
            opacity={0.45}
          />
        </mesh>
      </Float>
      
      <Float speed={1.8} rotationIntensity={0.6} floatIntensity={1.2}>
        <mesh position={[-4.2, -2.6, -2.8]} rotation={[0.3, 0.25, -0.2]}>
          <boxGeometry args={[1.9, 1.3, 0.05]} />
          <meshStandardMaterial 
            color="#0284c7" 
            roughness={0.3} 
            metalness={0.65}
            transparent={true}
            opacity={0.35}
          />
        </mesh>
      </Float>

      <Float speed={1.4} rotationIntensity={0.5} floatIntensity={0.8}>
        <mesh position={[4.4, 2.7, -3.2]} rotation={[-0.15, -0.3, 0.2]}>
          <boxGeometry args={[1.4, 1.4, 0.05]} />
          <meshStandardMaterial 
            color="#0d9488" 
            roughness={0.35} 
            metalness={0.45}
            transparent={true}
            opacity={0.3}
          />
        </mesh>
      </Float>
    </group>
  );
}

export default function Scene() {
  return (
    <div id="canvas-container">
      <Canvas 
        camera={{ position: [0, 0, 6], fov: 45 }} 
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[8, 10, 5]} intensity={1.2} />
        <directionalLight position={[-8, -5, -3]} intensity={0.6} color="#0d9488" />
        
        <FloatingObjects />
        
        <Preload all />
      </Canvas>
    </div>
  );
}

