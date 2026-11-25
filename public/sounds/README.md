# Real recordings (optional)

The game synthesises every sound, but real recordings sound better for bangs. Drop royalty-free
recordings (for example CC0 clips from freesound.org) in this folder and list them in
`manifest.json`; they replace the synthesised version automatically. Any sound without a
recording keeps its synthesised version.

```json
{
  "bomb":   ["bomb1.mp3", "bomb2.mp3"],
  "snap":   ["ladi1.mp3", "ladi2.mp3", "ladi3.mp3"],
  "snapper":["snapper1.mp3"],
  "pencil": ["pencil1.mp3"],
  "mortar": ["mortar1.mp3"],
  "burst":  ["shell1.mp3", "shell2.mp3"],
  "burst:willow": ["willow1.mp3"],
  "fuse":   ["fuse_loop.mp3"],
  "sparkler": ["sparkler_loop.mp3"]
}
```

Keys: `click select whoosh levelUp star match fuse sparkler anar spinner rocketFlight mortar burst bomb
snap pencil snapper`. A key can have several files (one is picked at random, with slight pitch
variation). `burst` also accepts a kind: `burst:rocket`, `burst:shell`, `burst:peony`, `burst:willow`,
`burst:ring`. Looping sounds (`fuse sparkler anar spinner`) should be seamless loops.
One-shots should start with the sound itself (no leading silence).
