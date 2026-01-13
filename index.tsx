import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

// --- Configuration ---
const TILE_SIZE = 10;
const WALL_HEIGHT = 8;
const PLAYER_HEIGHT = 3;
const PLAYER_SPEED = 30; // Units per second
const PLAYER_JUMP = 35;
const GRAVITY = 80;

// --- Enemy Data / "Folder" ---
// Please save your images in the public folder or alongside index.html with these names:
const ENEMIES_DATA = [
  {
    id: "a",
    image: "./assets/mambo.jpg", // The Rice Shower image (Blue rose hat)
    sound: "./assets/mambo.mp3", // Sound file for this enemy
    speed: 16,
    height: 3.0, 
    weight: 1.5,
  },
  {
    id: "b",
    image: "./assets/goldin-ship.jpg", // The Symboli Rudolf image (Green uniform)
    sound: "./assets/golshin.mp3", // Sound file for this enemy
    speed: 10,
    height: 3.8,
    weight: 2.5,
  }
];

// 1 = Wall, 0 = Floor, 'a'/'b' = Enemies
const LEVEL_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 'a', 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 'b', 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 'a', 0, 1],
  [1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
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
  const gameStateRef = useRef<'start' | 'playing' | 'gameover'>('start'); // Ref for access inside loop
  const playerRef = useRef<THREE.Group | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Refs to manage audio outside the game loop
  const activeEnemiesRef = useRef<{ mesh: THREE.Sprite, config: typeof ENEMIES_DATA[0], velocity: THREE.Vector3 }[]>([]);
  const dieSoundRef = useRef<THREE.Audio | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;

    if (gameState === 'gameover') {
        // 1. Stop all enemy sounds
        activeEnemiesRef.current.forEach(enemy => {
            const sound = enemy.mesh.children.find(c => c instanceof THREE.PositionalAudio) as THREE.PositionalAudio;
            if (sound && sound.isPlaying) {
                sound.stop();
            }
        });

        // 2. Play die sound
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
    scene.fog = new THREE.Fog(COLORS.sky, 20, 100);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // --- Audio Setup ---
    const listener = new THREE.AudioListener();
    camera.add(listener);
    audioContextRef.current = listener.context;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mountRef.current.innerHTML = ''; // Clear previous canvas
    mountRef.current.appendChild(renderer.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // --- Level Generation ---
    const walls: THREE.Box3[] = [];
    // We use a local array for the loop, but update the ref for global access
    const activeEnemies: { mesh: THREE.Sprite, config: typeof ENEMIES_DATA[0], velocity: THREE.Vector3 }[] = [];
    
    const geometry = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
    const wallMaterial = new THREE.MeshLambertMaterial({ color: COLORS.wall });
    const floorMaterial = new THREE.MeshLambertMaterial({ color: COLORS.floor });

    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    // Floor
    const mapWidth = LEVEL_MAP[0].length;
    const mapDepth = LEVEL_MAP.length;
    const floorGeo = new THREE.PlaneGeometry(mapWidth * TILE_SIZE, mapDepth * TILE_SIZE);
    const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set( (mapWidth * TILE_SIZE) / 2 - TILE_SIZE/2, 0, (mapDepth * TILE_SIZE) / 2 - TILE_SIZE/2 );
    floorMesh.receiveShadow = true;
    mapGroup.add(floorMesh);

    // Parse Map
    let startX = 1;
    let startZ = 1;

    // Texture & Audio Loaders
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
          wall.castShadow = true;
          wall.receiveShadow = true;
          mapGroup.add(wall);
          walls.push(new THREE.Box3().setFromObject(wall));
        } else if (typeof cell === 'string') {
          // Enemy
          const enemyConfig = ENEMIES_DATA.find(e => e.id === cell);
          if (enemyConfig) {
            const map = textureLoader.load(enemyConfig.image);
            map.magFilter = THREE.NearestFilter;
            const material = new THREE.SpriteMaterial({ map: map });
            const sprite = new THREE.Sprite(material);
            
            // Set Size based on config
            sprite.scale.set(enemyConfig.weight * 2, enemyConfig.height * 2, 1); 
            
            // Position: Y is half height to stand on floor
            sprite.position.set(posX, enemyConfig.height, posZ);
            scene.add(sprite);
            
            // --- Add Sound ---
            if (enemyConfig.sound) {
                const sound = new THREE.PositionalAudio(listener);
                audioLoader.load(enemyConfig.sound, (buffer) => {
                    sound.setBuffer(buffer);
                    sound.setRefDistance(5); // Volume starts dropping after 5 units
                    sound.setRolloffFactor(2); // Drops off relatively quickly
                    sound.setLoop(true);
                    sound.setVolume(1.0);
                    // Don't play immediately here, wait for interaction or start
                    // However, for simplicity in this flow, we play and let context state handle it
                    // Or we can rely on handleStart to resume context.
                    if (gameStateRef.current === 'playing') {
                        sound.play();
                    } else {
                        // If loaded before start, sound.play() works but context is suspended
                        sound.play();
                    }
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
        
        // Determine start pos (first empty space)
        if (cell === 0 && startX === 1 && startZ === 1) {
            startX = x;
            startZ = z;
        }
      });
    });
    
    // Store in ref for global access (gameover logic)
    activeEnemiesRef.current = activeEnemies;

    
    // --- Player Setup ---
    const playerGroup = new THREE.Group();
    playerGroup.position.set(startX * TILE_SIZE, PLAYER_HEIGHT, startZ * TILE_SIZE);
    playerGroup.add(camera);
    scene.add(playerGroup);
    playerRef.current = playerGroup;

    // --- Inputs ---
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
    
    // Mouse Look
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
    const playerBox = new THREE.Box3();
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

      // 1. Player Physics
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

      // 2. Enemy Logic
      activeEnemies.forEach(enemy => {
        const dist = enemy.mesh.position.distanceTo(playerGroup.position);
        
        // Game Over Check
        if (dist < 3.0) {
            // CRITICAL: Update ref IMMEDIATELY before exiting pointer lock.
            // This prevents onPointerLockChange from reverting the state to 'start' (pause)
            gameStateRef.current = 'gameover'; 
            setGameState('gameover');
            document.exitPointerLock();
        }

        // Chase Logic
        const toPlayer = new THREE.Vector3()
            .subVectors(playerGroup.position, enemy.mesh.position);
        toPlayer.y = 0; // Don't fly up/down
        toPlayer.normalize();

        const moveDist = enemy.config.speed * delta;
        
        // Use 'weight' as the physical width for collision
        const enemySize = new THREE.Vector3(enemy.config.weight, enemy.config.height, enemy.config.weight);

        // Try move X
        enemy.mesh.position.x += toPlayer.x * moveDist;
        if (checkWallCollision(enemy.mesh.position, enemySize)) {
             enemy.mesh.position.x -= toPlayer.x * moveDist;
        }

        // Try move Z
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
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const onPointerLockChange = () => {
        if (document.pointerLockElement === document.body) {
            setGameState('playing');
        } else {
            // Unlocking
            // If we are currently 'playing' in the ref, it means the user pressed ESC.
            // If we are 'gameover', it means we called exitPointerLock() from the gameover block.
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
  }, []); // Re-run if level changes

  const handleStart = () => {
    document.body.requestPointerLock();
    // Resume AudioContext if suspended
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }
    
    // If clicking on Game Over screen, reload page to restart
    if (gameState === 'gameover') {
         window.location.reload(); 
    }
  };

  return (
    <>
        <div ref={mountRef} />
        {gameState === 'playing' && <div id="crosshair"></div>}
        
        {gameState === 'start' && (
            <div id="instructions" onClick={handleStart}>
                <h1>UMA MAZE</h1>
                <p>Click to Start</p>
                <div className="controls">
                    <div><span className="key">WASD</span> Move</div>
                    <div><span className="key">SPACE</span> Jump</div>
                    <div><span className="key">MOUSE</span> Look</div>
                </div>
                <p style={{marginTop: '20px', fontSize: '0.9rem', color: '#888'}}>
                    Created by <b>Zidane Khaled</b>
                </p>
            </div>
        )}

        {gameState === 'gameover' && (
            <div id="instructions" onClick={handleStart} style={{backgroundColor: 'rgba(50, 0, 0, 0.8)'}}>
                <h1 style={{color: 'red'}}>YOU DIED</h1>
                <p>The enemies caught you.</p>
                <p style={{marginTop: '20px', fontSize: '1rem'}}>Click to Try Again (Restarts Game)</p>
            </div>
        )}
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
