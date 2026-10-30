/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { initDeadYardEngine } from './game/engine';

export default function App() {
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewRef.current) return;
    const cleanup = initDeadYardEngine(viewRef.current);
    return cleanup;
  }, []);

  return (
    <>
      <div id="view" ref={viewRef} data-testid="webgl-viewport" />
      <div className="fx" id="vignette" />
      <div className="fx" id="grain" />
      <div className="fx" id="hurt" />
      <div id="scope">
        <i />
      </div>
      <div id="reticle" />
      <div id="dnwrap" />

      <div id="hud" hidden>
        <div className="row">
          <div id="hp">
            <div className="lab">Vitals</div>
            <div className="big" id="hpnum">
              200 / 200
            </div>
            <div id="hpbar">
              <div id="hpghost" />
              <div id="hpfill" />
            </div>
          </div>
          <div id="wave">
            <div className="lab">Wave</div>
            <div className="big" id="wavenum">
              1
            </div>
            <div id="left" />
            <div id="msg" />
          </div>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="lab" id="hint">
            WASD move · Shift sprint · C crouch · H medkit · Q wheel · 1-6 weapons · P pause
          </div>
          <div id="ammo">
            <div id="reload" />
            <div id="wname">Vanguard AR</div>
            <div className="big">
              <b id="mag">30</b>{' '}
              <span>
                / <span id="res">150</span>
              </span>
            </div>
            <div className="lab">
              <span id="kills">0</span> kills
            </div>
          </div>
        </div>
      </div>

      <button id="medkitBtn" className="medkit desktop-medkit" type="button" hidden aria-label="Use medkit (Key H)">
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="var(--moss)" fill="none" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>MEDKIT [H]</span>
        <small id="medkitCount">2</small>
      </button>

      <div id="topRightHud" hidden>
        <button
          id="utilMute"
          className="util-btn"
          type="button"
          tabIndex={-1}
          aria-label="Toggle audio mute (Key M)"
          title="Mute [M]"
        >
          <svg viewBox="0 0 24 24">
            <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        </button>
        <button
          id="utilRestart"
          className="util-btn"
          type="button"
          tabIndex={-1}
          aria-label="Restart current match"
          title="Restart Match"
        >
          <svg viewBox="0 0 24 24">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button
          id="utilPause"
          className="util-btn"
          type="button"
          tabIndex={-1}
          aria-label="Pause game (Key P)"
          title="Pause [P]"
        >
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14M16 5v14" />
          </svg>
        </button>
        <button id="wBtn" type="button" aria-label="Switch weapon">
          <span id="wName">Vanguard AR</span>
          <small id="wSlot">1 / 6 · Assault rifle</small>
        </button>
      </div>

      <canvas id="radar" width={208} height={208} hidden />
      <div id="dmgdir">
        <i />
      </div>
      <div id="cross" hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div id="wheel">
        <div id="wring">
          <div id="wcenter" />
        </div>
      </div>

      <div id="touch" hidden>
        <div id="stickZone" />
        <div id="stickBase" hidden>
          <div id="stickKnob" />
        </div>
        <div id="lookZone" />
        <button className="tb" id="bSprint" type="button" aria-label="Sprint">
          Run
        </button>
        <button className="tb" id="bFire2" type="button" aria-label="Secondary fire">
          Fire
        </button>
        <button className="tb" id="bCrouch" type="button" aria-label="Crouch">
          Duck
        </button>
        <button className="tb" id="bReload" type="button" aria-label="Reload weapon">
          Reload
        </button>
        <button className="tb" id="bJump" type="button" aria-label="Jump">
          Jump
        </button>
        <button className="tb" id="bAds" type="button" aria-label="Aim down sights">
          Aim
        </button>
        <button className="tb" id="bFire" type="button" aria-label="Primary fire">
          Fire
        </button>
        <button className="tb" id="bPause" type="button" aria-label="Pause game">
          II
        </button>
        <button className="tb medkit" id="bMedkit" type="button" aria-label="Use medkit">
          + HP
        </button>
      </div>

      <div id="rotate">
        <div className="ph" />
        <p>Rotate to landscape</p>
      </div>

      <div id="card">
        <div className="brief">
          <div className="cols">
            <div className="c1">
              <div>
                <div className="lab" id="kicker">
                  First-person survival combat
                </div>
                <div className="title-lockup">
                  <svg className="title-emblem" viewBox="0 0 64 64" aria-hidden="true">
                    <polygon
                      points="32,4 58,16 58,44 32,60 6,44 6,16"
                      fill="rgba(255,193,61,0.12)"
                      stroke="#ffc13d"
                      strokeWidth="2.5"
                    />
                    <circle cx="32" cy="32" r="14" fill="none" stroke="#f1f3f5" strokeWidth="2" />
                    <path
                      d="M32 10v10M32 44v10M10 32h10M44 32h10"
                      stroke="#ffc13d"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <circle cx="32" cy="32" r="3.5" fill="#ff4d4d" />
                  </svg>
                  <h1 id="title">
                    Dead
                    <br />
                    <em>Yard</em>
                  </h1>
                </div>
                <div id="finalStats" hidden />
                <p id="blurb">
                  Hostile squads push in from the front. Heavies soak damage, rushers run you down, marksmen mark you
                  with a laser before they fire. Use cover and the radar. You have 200 HP and health recovers when you
                  are not being hit.
                </p>
                <p className="tonly">
                  Play in landscape. Left thumb moves, right thumb aims. Hold FIRE to shoot, AIM to zoom. Tap the weapon
                  button (top right) to cycle, or hold it to open the weapon wheel.
                </p>
                <div id="modeStep">
                  <div className="lab">Game mode</div>
                  <div className="seg" id="modes">
                    <button type="button" className="opt on" data-mode="endless">
                      <span>Survival</span>
                      <small>Endless waves · 200 HP</small>
                    </button>
                    <button type="button" className="opt" data-mode="timed">
                      <span>Timed 3:00</span>
                      <small>Hold out for 3 minutes</small>
                    </button>
                    <button type="button" className="opt" data-mode="cod">
                      <span>Elimination</span>
                      <small>First to 30 kills wins</small>
                    </button>
                    <button type="button" className="opt" data-mode="megafps">
                      <span>Mega Arena</span>
                      <small>Largest city battlefield</small>
                    </button>
                  </div>
                </div>
              </div>
              <div className="actions">
                <button id="go" type="button" data-start="true">
                  Start
                </button>
                <button id="pauseRestart" className="opt" type="button" hidden>
                  Restart
                  <small>Fresh wave 1</small>
                </button>
                <button id="pauseTitle" className="opt" type="button" hidden>
                  Title Screen
                  <small>Change mode or map</small>
                </button>
                <button id="openSet" className="opt" type="button">
                  Settings
                  <small>Controls · graphics · audio</small>
                </button>
              </div>
            </div>
            <div className="c2">
              <div id="mdwrap">
                <div className="lab">Battlefield</div>
                <div className="seg" id="maps" />
                <div className="lab">Difficulty</div>
                <div className="seg" id="diffs" />
              </div>
              <div id="pauseArsenal" hidden>
                <div className="lab">Arsenal &amp; Ammo Status · Click to Equip</div>
                <div className="seg" id="pauseWeapons" />
              </div>
              <div className="keys">
                <b>W A S D</b>
                <span>Move</span>
                <b>Mouse</b>
                <span>Aim · click to lock cursor</span>
                <b>Left / Right click</b>
                <span>Fire / aim down sights</span>
                <b>Q (hold) · 1–6</b>
                <span>Weapon wheel / switch weapons</span>
                <b>R · H · C · Shift</b>
                <span>Reload · medkit · crouch · sprint</span>
                <b>Space · P / Esc</b>
                <span>Jump · pause menu</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="settings" role="dialog" aria-label="Game settings">
        <div className="sbox">
          <div className="shead">
            <h2>Settings</h2>
            <button className="opt" id="setReset" type="button">
              Reset all
            </button>
            <button className="opt on" id="setBack" type="button">
              Back
            </button>
          </div>
          <div className="tabs" id="stabs" />
          <div className="sbody" id="sbody" />
        </div>
      </div>

      <div id="hudEditBar">
        <div className="lab" id="edName">
          Drag any control to move it
        </div>
        <div className="srow">
          <label htmlFor="edSize">Size</label>
          <input id="edSize" type="range" min="0.5" max="2" step="0.05" defaultValue="1" />
          <output id="edSizeO">100%</output>
        </div>
        <div className="srow">
          <label htmlFor="edOp">Opacity</label>
          <input id="edOp" type="range" min="0.2" max="1" step="0.05" defaultValue="1" />
          <output id="edOpO">100%</output>
        </div>
        <div className="btns">
          <button className="opt" id="edHide" type="button">
            Hide
          </button>
          <button className="opt" id="edResetOne" type="button">
            Reset this
          </button>
          <button className="opt" id="edResetAll" type="button">
            Reset all
          </button>
          <button className="opt on" id="edDone" type="button">
            Done
          </button>
        </div>
      </div>

      <div id="fps" />
    </>
  );
}
