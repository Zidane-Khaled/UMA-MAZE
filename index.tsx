import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

// --- Configuration ---
const TILE_SIZE = 10;
const WALL_HEIGHT = 8;
const PLAYER_HEIGHT = 3;
const PLAYER_SPEED = 30;
const PLAYER_JUMP = 35;
const GRAVITY = 80;
const PS1_RESOLUTION_SCALE = 0.5; // 0.5 = half res, 0.25 = quarter res for extreme PS1 look

// --- Enemy Data ---
const ENEMIES_DATA = [
  {
    id: "a",
    image: "./assets/mambo.png",
    sound: "./assets/mambo.mp3",
    speed: 26,
    height: 3.0, 
    weight: 1.5,
  },
  {
    id: "b",
    image: "./assets/goldin-ship.png",
    sound: "./assets/golshin.mp3",
    speed: 26,
    height: 3.8,
    weight: 2.5,
  }
];

// 1 = Wall, 0 = Floor, 'a'/'b' = Enemies
const LEVEL_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,'a',0,1],
  [1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,1,1,1,0,0,1,1,1,1,0,0,1,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,'b',0,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,1],
  [1,1,1,1,0,0,1,1,1,0,0,1,1,1,0,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'a',0,0,1],
  [1,0,0,1,1,1,1,1,0,0,1,1,1,1,1,1,1,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,0,1,1,1,1,1,0,0,1,1,1,1,1,1,1,0,0,1],
  [1,0,'a',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'b',0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const COLORS = {
  sky: 0x87ceeb,
  floor: 0x2a2a2a,
  wall: 0x8d99ae,
  wallDark: 0x2b2d42,
  light: 0xffffff
};

const App = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const gameStateRef = useRef<'start' | 'playing' | 'gameover'>('start');
  const playerRef = useRef<THREE.Group | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeEnemiesRef = useRef<{ mesh: THREE.Sprite, config: typeof ENEMIES_DATA[0], velocity: THREE.Vector3 }[]>([]);
  const dieSoundRef = useRef<THREE.Audio | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;

    if (gameState === 'playing') {
      activeEnemiesRef.current.forEach(enemy => {
        const sound = enemy.mesh.children.find(
          c => c instanceof THREE.PositionalAudio
        ) as THREE.PositionalAudio;

        if (sound && !sound.isPlaying) {
          sound.play();
        }
      });
    }

    if (gameState === 'gameover') {
      activeEnemiesRef.current.forEach(enemy => {
        const sound = enemy.mesh.children.find(
          c => c instanceof THREE.PositionalAudio
        ) as THREE.PositionalAudio;

        if (sound && sound.isPlaying) {
          sound.stop();
        }
      });

      if (dieSoundRef.current && !dieSoundRef.current.isPlaying) {
        dieSoundRef.current.play();
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.sky);
    scene.fog = new THREE.Fog(COLORS.sky, 20, 80); // Reduced far distance for better performance

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // --- Audio Setup ---
    const listener = new THREE.AudioListener();
    camera.add(listener);
    audioContextRef.current = listener.context;

    // --- Renderer Setup (PS1 Style) ---
    const renderer = new THREE.WebGLRenderer({ 
      antialias: false, // No antialiasing for PS1 look
      powerPreference: 'high-performance'
    });
    
    // Render at reduced resolution
    renderer.setSize(
      window.innerWidth * PS1_RESOLUTION_SCALE, 
      window.innerHeight * PS1_RESOLUTION_SCALE,
      false
    );
    
    // Stretch canvas to full size with pixelated rendering
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.imageRendering = 'pixelated';
    
    renderer.setPixelRatio(1); // Lock to 1 for consistent PS1 look
    renderer.shadowMap.enabled = false; // No shadows for performance
    
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // --- Lighting (Simplified) ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // --- Level Generation ---
    const walls: THREE.Box3[] = [];
    const activeEnemies: { mesh: THREE.Sprite, config: typeof ENEMIES_DATA[0], velocity: THREE.Vector3 }[] = [];
    
    // Use BasicMaterial for performance (no lighting calculations)
    const geometry = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
    const wallMaterial = new THREE.MeshBasicMaterial({ 
      color: COLORS.wall,
      flatShading: true
    });
    const floorMaterial = new THREE.MeshBasicMaterial({ 
      color: COLORS.floor,
      flatShading: true
    });

    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    // Floor
    const mapWidth = LEVEL_MAP[0].length;
    const mapDepth = LEVEL_MAP.length;
    const floorGeo = new THREE.PlaneGeometry(mapWidth * TILE_SIZE, mapDepth * TILE_SIZE);
    const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set( (mapWidth * TILE_SIZE) / 2 - TILE_SIZE/2, 0, (mapDepth * TILE_SIZE) / 2 - TILE_SIZE/2 );
    mapGroup.add(floorMesh);

    // Parse Map
    let startX = 1;
    let startZ = 1;

    const textureLoader = new THREE.TextureLoader();
    const audioLoader = new THREE.AudioLoader();

    // Load Die Sound
    const dieSound = new THREE.Audio(listener);
    audioLoader.load('./assets/die.mp3', (buffer) => {
        dieSound.setBuffer(buffer);
        dieSound.setVolume(0.5); 
        dieSound.setLoop(false);
        dieSoundRef.current = dieSound;
    }, undefined, (err) => console.warn("Missing die.mp3"));

    LEVEL_MAP.forEach((row, z) => {
      row.forEach((cell, x) => {
        const posX = x * TILE_SIZE;
        const posZ = z * TILE_SIZE;

        if (cell === 1) {
          // Wall
          const wall = new THREE.Mesh(geometry, wallMaterial);
          wall.position.set(posX, WALL_HEIGHT / 2, posZ);
          mapGroup.add(wall);
          walls.push(new THREE.Box3().setFromObject(wall));
        } else if (typeof cell === 'string') {
          // Enemy
          const enemyConfig = ENEMIES_DATA.find(e => e.id === cell);
          if (enemyConfig) {
            const map = textureLoader.load(enemyConfig.image);
            map.magFilter = THREE.NearestFilter; // Pixelated textures
            map.minFilter = THREE.NearestFilter;
            const material = new THREE.SpriteMaterial({ map: map });
            const sprite = new THREE.Sprite(material);
            
            sprite.scale.set(enemyConfig.weight * 2, enemyConfig.height * 2, 1); 
            sprite.position.set(posX, enemyConfig.height, posZ);
            scene.add(sprite);
            
            // Add Sound
            if (enemyConfig.sound) {
                const sound = new THREE.PositionalAudio(listener);
                audioLoader.load(enemyConfig.sound, (buffer) => {
                    sound.setBuffer(buffer);
                    sound.setRefDistance(5);
                    sound.setRolloffFactor(2);
                    sound.setLoop(true);
                    sound.setVolume(1.0);
                }, undefined, (err) => {
                    console.warn(`Could not load sound: ${enemyConfig.sound}`, err);
                });
                sprite.add(sound);
            }

            activeEnemies.push({
                mesh: sprite,
                config: enemyConfig,
                velocity: new THREE.Vector3()
            });
          }
        }
        
        if (cell === 0 && startX === 1 && startZ === 1) {
            startX = x;
            startZ = z;
        }
      });
    });
    
    activeEnemiesRef.current = activeEnemies;
    
    // --- Player Setup ---
    const playerGroup = new THREE.Group();
    playerGroup.position.set(startX * TILE_SIZE, PLAYER_HEIGHT, startZ * TILE_SIZE);
    playerGroup.add(camera);
    scene.add(playerGroup);
    playerRef.current = playerGroup;

    // --- Input Handling ---
    const moveState = { forward: false, backward: false, left: false, right: false, jump: false };
    let canJump = false;

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveState.forward = true; break; 
        case 'ArrowLeft': case 'KeyA': moveState.left = true; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = true; break; 
        case 'ArrowRight': case 'KeyD': moveState.right = true; break;
        case 'Space': if (canJump) { velocity.y += PLAYER_JUMP; canJump = false; } break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveState.forward = false; break;
        case 'ArrowLeft': case 'KeyA': moveState.left = false; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = false; break;
        case 'ArrowRight': case 'KeyD': moveState.right = false; break;
      }
    };
    
    const onMouseMove = (event: MouseEvent) => {
      if (gameStateRef.current === 'playing') {
        playerGroup.rotation.y -= event.movementX * 0.002;
        camera.rotation.x -= event.movementY * 0.002;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);

    // --- Physics ---
    const velocity = new THREE.Vector3();
    const playerSize = new THREE.Vector3(1.5, PLAYER_HEIGHT, 1.5); 

    const checkWallCollision = (pos: THREE.Vector3, size: THREE.Vector3) => {
        const min = new THREE.Vector3(pos.x - size.x/2, pos.y - size.y/2, pos.z - size.z/2);
        const max = new THREE.Vector3(pos.x + size.x/2, pos.y + size.y/2, pos.z + size.z/2);
        const box = new THREE.Box3(min, max);
        for (const wall of walls) {
            if (box.intersectsBox(wall)) return true;
        }
        return false;
    };

    // --- Animation Loop ---
    const clock = new THREE.Clock();
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (gameStateRef.current !== 'playing') return;

      const delta = Math.min(clock.getDelta(), 0.1); 

      // Player Physics
      velocity.x -= velocity.x * 10.0 * delta;
      velocity.z -= velocity.z * 10.0 * delta;
      velocity.y -= GRAVITY * delta; 

      const direction = new THREE.Vector3();
      direction.z = Number(moveState.forward) - Number(moveState.backward);
      direction.x = Number(moveState.right) - Number(moveState.left);
      direction.normalize(); 

      if (moveState.forward || moveState.backward) velocity.z -= direction.z * PLAYER_SPEED * 10.0 * delta;
      if (moveState.left || moveState.right) velocity.x -= direction.x * PLAYER_SPEED * 10.0 * delta;

      // Move X
      const oldPosX = playerGroup.position.clone();
      playerGroup.translateX(-velocity.x * delta); 
      if (checkWallCollision(playerGroup.position, playerSize)) {
          playerGroup.position.copy(oldPosX);
          velocity.x = 0;
      }

      // Move Z
      const oldPosZ = playerGroup.position.clone();
      playerGroup.translateZ(velocity.z * delta);
      if (checkWallCollision(playerGroup.position, playerSize)) {
          playerGroup.position.copy(oldPosZ);
          velocity.z = 0;
      }

      // Move Y
      const oldPosY = playerGroup.position.clone();
      playerGroup.position.y += velocity.y * delta;
      if (playerGroup.position.y < PLAYER_HEIGHT) {
          velocity.y = 0;
          playerGroup.position.y = PLAYER_HEIGHT;
          canJump = true;
      } else if (checkWallCollision(playerGroup.position, playerSize)) {
          playerGroup.position.copy(oldPosY);
          velocity.y = 0;
      }

      // Enemy AI
      activeEnemies.forEach(enemy => {
        const dist = enemy.mesh.position.distanceTo(playerGroup.position);
        
        if (dist < 3.0) {
            gameStateRef.current = 'gameover'; 
            setGameState('gameover');
            document.exitPointerLock();
        }

        const toPlayer = new THREE.Vector3()
            .subVectors(playerGroup.position, enemy.mesh.position);
        toPlayer.y = 0;
        toPlayer.normalize();

        const moveDist = enemy.config.speed * delta;
        const enemySize = new THREE.Vector3(enemy.config.weight, enemy.config.height, enemy.config.weight);

        enemy.mesh.position.x += toPlayer.x * moveDist;
        if (checkWallCollision(enemy.mesh.position, enemySize)) {
             enemy.mesh.position.x -= toPlayer.x * moveDist;
        }

        enemy.mesh.position.z += toPlayer.z * moveDist;
        if (checkWallCollision(enemy.mesh.position, enemySize)) {
             enemy.mesh.position.z -= toPlayer.z * moveDist;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        window.innerWidth * PS1_RESOLUTION_SCALE,
        window.innerHeight * PS1_RESOLUTION_SCALE,
        false
      );
    };
    window.addEventListener('resize', handleResize);

    const onPointerLockChange = () => {
        if (document.pointerLockElement === document.body) {
            setGameState('playing');
        } else {
            if (gameStateRef.current === 'playing') {
                setGameState('start'); 
            }
        }
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleStart = () => {
    document.body.requestPointerLock();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }
    
    if (gameState === 'gameover') {
         window.location.reload(); 
    }
  };

  return (
    <>
        <div ref={mountRef} style={{
          width: '100%',
          height: '100vh',
          overflow: 'hidden'
        }} />
        
        {gameState === 'playing' && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            width: '4px',
            height: '4px',
            background: '#fff',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            boxShadow: '0 0 2px 2px rgba(0,0,0,0.5)'
          }} />
        )}
        
        {gameState === 'start' && (
            <div onClick={handleStart} style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(0, 0, 0, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#fff',
              fontFamily: 'monospace',
              cursor: 'pointer',
              textAlign: 'center',
              padding: '20px'
            }}>
                <h1 style={{fontSize: '4rem', marginBottom: '2rem', textShadow: '4px 4px 0 #000'}}>UMA MAZE</h1>
                <p style={{fontSize: '1.5rem', marginBottom: '3rem'}}>Click to Start</p>
                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '1.2rem'}}>
                    <div><span style={{background: '#333', padding: '8px 16px', borderRadius: '4px', marginRight: '12px'}}>WASD</span> Move</div>
                    <div><span style={{background: '#333', padding: '8px 16px', borderRadius: '4px', marginRight: '12px'}}>SPACE</span> Jump</div>
                    <div><span style={{background: '#333', padding: '8px 16px', borderRadius: '4px', marginRight: '12px'}}>MOUSE</span> Look</div>
                </div>
                <p style={{marginTop: '40px', fontSize: '0.9rem', color: '#888'}}>
                    Created by <strong>Zidane Khaled</strong> | PS1 Style
                </p>
            </div>
        )}

        {gameState === 'gameover' && (
            <div onClick={handleStart} style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(50, 0, 0, 0.9)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#fff',
              fontFamily: 'monospace',
              cursor: 'pointer',
              textAlign: 'center'
            }}>
                <h1 style={{fontSize: '4rem', color: '#ff4444', marginBottom: '2rem', textShadow: '4px 4px 0 #000'}}>YOU DIED</h1>
                <p style={{fontSize: '1.2rem', marginBottom: '1rem'}}>The uma caught you.</p>
                <p style={{fontSize: '1rem', color: '#aaa'}}>Click to Try Again</p>
            </div>
        )}
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);