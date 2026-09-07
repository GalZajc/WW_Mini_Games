# Structural and rocking physics

ReRoMo Tetris has three structural modes. `Structural Cartesian` uses the
ordinary rectangular board with rigid polyomino bodies. `Rocking · Lines` puts
the board on a rolling circular platform and clears a row when it is filled
across the deck. `Rocking · Pressure` uses the same platform but collapses an
occupied row when the total locked mass strictly above that row reaches the
configured threshold. The mode selector is shown when the game starts; the
corresponding mode profile and settings are also available in the game settings
view.

The physics implementation is split by responsibility: the rocking geometry
and integrator are in `rocking-physics.js`, contact equilibrium and toppling
certificates are in `structural-stability.js`, and the user-facing defaults and
validation are in `settings.js`. The game passes a normalized copy of these
values to the solver, so the editable physical parameters stay together.

## Parameters and units

Every locked cell has the configured `Mass per Cell` in kilograms and
`Cell Size` is measured in metres. `Gravity` is in m/s². A falling piece is not
part of the structural mass until it locks; the platform mass and all locked
cells, including valid locked overhang cells, are included in the rocking
assembly's total mass and inertia.

Three independent dimensionless Coulomb coefficients apply to piece–piece,
piece–wall, and piece–platform (including the fixed floor) contacts. All default
to zero. The deck coefficient is never taken from the side-wall coefficient. The contact model uses the usual
friction-cone bound `|T| ≤ μN`; the [MIT friction-cone reference](https://manipulation.mit.edu/clutter.html)
gives the geometric interpretation used here.

Rocking settings are active in both rocking modes:

| Setting | Meaning and domain |
|---|---|
| Grid Width (cells) | Integer deck length from 1 through 256. The physical chord is this value times `Cell Size`. |
| Platform Arc Angle (°) | Circular-segment arc angle from 5° through 180°. |
| Platform Mass (kg) | Positive mass of the uniform circular segment, including its exact centroid and inertia. |
| Rolling Resistance | Non-negative dimensionless `μ_roll`. The resisting torque magnitude is `μ_roll M g R`, where `M` is the current platform-plus-locked-cell mass and `R` is the segment radius. |
| Allow Side Overhangs | When enabled, sparse cells may extend beyond either deck edge. Those cells have no floor or wall contact until they meet another locked cell. Side walls are absent in this setting. |
| Collapse: Mass Above Row (kg) | Pressure-mode threshold. Only occupied rows are considered, and the mass counted for a row comes from cells on smaller row indices, strictly above it. Equality with the threshold qualifies. |

With side overhangs disabled, the deck edges provide external side-wall
contacts. With side overhangs enabled, cells outside the deck are retained in
the structural grid and line shifts, but an empty off-platform cell does not
create a phantom floor or a landing ghost.

## Circular platform model

The platform is a uniform massive circular segment whose chord is the deck.
The radius, sag, centroid, centre-of-mass inertia, and inertia about the
rolling circle centre are calculated analytically from the chord length and arc
angle. The locked-cell contribution uses the parallel-axis theorem, so a cell
added or removed from the stack changes both the centre of mass and total
inertia.

The platform state is integrated with deterministic RK4 substeps of 1/240 s
(a long render update is capped at 0.1 s and subdivided). The no-slip
kinematics keeps the circle centre moving by `R·θ` while the segment rotates;
rolling resistance can hold an assembly at rest when the gravitational torque
is inside its static holding interval. After the platform state advances,
rocking mode performs a structural contact check in the current frame. The
viewport fits the current grid and platform bounds to the available window.
HUD panels sit directly beside those bounds; controls align with their lower
edge. Resizing and rocking update this fit without reserving the entire sweep.

## Contact equilibrium

Each body is treated as rigid and contacts are compression-only unless a
friction coefficient permits a tangential reaction. Touching bodies are not
glued. The fast vertical certificate handles ordinary downward stacking. More
general load sharing, side contacts, friction, and mutually supporting bodies
use the bundled sparse HiGHS WASM equilibrium solve. A zero virtual-work
optimum is static equilibrium; a positive optimum supplies a first-order
mechanism and its contact reactions.

During rocking, the solver receives the current frame angle, angular velocity
and angular acceleration, frame linear acceleration, and the frame origin. The
effective load includes transformed gravity, translational frame acceleration,
centrifugal `ω²r` terms, and angular-acceleration terms. Each body's angular
inertia contributes to its rotational load. Static certificates are evaluated
at zero body velocity, so Coriolis terms do not add a separate static load.
Exactly neutral torque is stable; the model does not inject a finite
perturbation into a perfectly balanced configuration.

For common stacks whose horizontal support patches share a height, the solver
first tries a linear contact-force certificate. It propagates each body's
horizontal and vertical load and moment, splits the resultant between the two
support endpoints, and checks each endpoint's Coulomb cone. This path is
`contact-certificate` and returns the physical normal and tangential contact
reactions. If the sufficient certificate is inconclusive, the bundled sparse
HiGHS WASM coupled equilibrium solve remains the fallback. The benchmark's
`forceCoupled` option exists only to time that reference path; it is not a game
setting.

Structural Cartesian checks are triggered by placement and line clearing.
Rocking checks are repeated as the moving platform advances. A line clear in
either structural family refreshes the locked-cell mass and splits disconnected
body identifiers before the next check.

## Detached grid pieces and rigid collapse

Entirely unsupported bodies with no fixed support path descend one integer row
per normal fall interval. They are removed from the locked mass until landing,
then re-enter the statics calculation; this does not end the run. Contact
configurations that may be held by friction remain the equilibrium solver's
responsibility. Partly supported cantilevers are never mistaken for free fall.

A tipping or sliding instability, or reaching the end of the platform arc,
starts `collapse-physics.js`: an offline vendored Planck rigid-body simulation.
Each surviving body ID is an independent rigid union of square cells. Collision
contacts, gravity, mass, inertia and the three friction coefficients determine
the movement; there is no imposed pivot or preselected loss angle. The rocking
platform also becomes a dynamic body. The simulator begins with the current
platform transform and rigid motion velocities, and runs until it settles.
Zero friction can permit motion indefinitely; a timeout does not pretend that
such a system has settled. Restart remains available during collapse.

The collision arc has at most 2 degrees per segment and uses one convex hull,
with analytic mass and inertia. The private Planck vertex capacity is explicitly
increased before constructing it: silent truncation would remove parts of the
arc. Solid static floor polygons avoid edge-collider scratch-buffer limits.
Contact slop is 0.1 mm. A half-second interval of low velocities is required to
report rest; an instantaneous turning point is not enough. Ground under the
rocker uses the platform/floor coefficient for fallen pieces. The platform itself
uses high ground traction and the separate rolling resistance torque.
These are numerical rigid-contact approximations, not a deformation model.
See the [Planck polygon API](https://piqnt.com/planck.js/docs/shape/polygon.html).

The piece outline is an independent pixel-width setting. Only each body's
boundary is stroked; internal grid edges are not made thicker. Disconnected
remains acquire separate body IDs after clearing rows. Locked outline paths
are reused until the geometry or board changes.

## Validation and timing

The focused rocking checks are run with:

```powershell
Set-Location -LiteralPath 'C:\Users\galza\Igre\pc\Moje Igrce\WW Mini Games'
node --test renderer/games/reromo-tetris/tests/rocking.test.mjs
```

They cover mode and bound validation, independent piece/wall friction,
moving-frame sliding, certificate-versus-coupled stability, independent
reaction force/moment and Coulomb-cone balances on seeded stacks, analytic
circular-segment geometry, finite-difference no-slip contact velocity, rolling
acceleration, energy conservation, static rolling resistance and arrest,
locked-cell mass updates, pressure thresholds, overhang collision/line shifts,
and the absence of a phantom overhang ghost.

`rocking-benchmark.mjs` records a deterministic moving-frame fixture under
`OUTPUT/rocking-benchmark_<UTC timestamp>`:

```powershell
Set-Location -LiteralPath 'C:\Users\galza\Igre\pc\Moje Igrce\WW Mini Games'
node renderer/games/reromo-tetris/rocking-benchmark.mjs
```

The recorded fixture is a 20×10 board with 30 locked 2×2 bodies filling the
bottom six rows, `angle = 0.05`, `omega = 0.1`, `alpha = 0.1`, frame origin
`(5, 20)`, `pieceFriction = 1`, `wallFriction = 1`, `platformFriction = 1`, and walls enabled. The
2026-09-05 UTC run warmed ten calls and measured ten calls on each path. The
production `contact-certificate` path was stable on every call with 60
reactions: median 0.48 ms, mean 0.69 ms, minimum 0.38 ms, and maximum 1.43 ms,
within the 16 ms median render-frame budget. The forced coupled-equilibrium
reference was also stable, with 504 reaction points and a median of 26.66 ms;
the certificate was 55.34× faster by median on that run. Timings vary with
machine load and are a fixture signal rather than a worst-case guarantee for
every board. The CSV contains both paths, while `parameters.json` records the
full normalized physics and runtime configuration.

The complete Tetris checks remain available with:

```powershell
npm.cmd run test:tetris
npm.cmd run test:tetris:smoke
node renderer/games/reromo-tetris/structural-benchmark.mjs
```
