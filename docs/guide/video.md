# Videos and OBS

Show Modus in a recording or a stream, over your own picture.

## Which window to capture

The ⧉ menu opens windows that follow what you play live. Each is a plain window you capture with OBS's **Window Capture**:

- **A whole layout:** any preset or one you saved, without controls, in its own window. It follows the main window, so you can keep working in another layout.
- **One element alone:** the chord with its degree, the staff, the circle of fifths, the piano, the guitar or the isomorphic keyboard.

## Make it transparent

Windows open on a chroma colour. Magenta is the default (green would key out the tonic, drawn in green); green, black and dark are in the menu too. **Panels** in the same menu can be *clear*: panels take the window's background, so the key takes them out too, and text and drawings get a soft shadow to stay readable.

In OBS:

1. Add a **Window Capture** source and pick the Modus window ("Modus view: chord", or the layout's name).
2. Add a **Chroma Key** filter with **Magenta** as the key colour and a similarity of 400 or less.
3. If a window looks late, try another capture method in the source's properties (Windows 10 1903+ or BitBlt). Measured in Chrome, the layout window trails the main one by about 10 ms; a longer delay comes from the capture.

## Stills

Each diagram's ⋯ menu saves it as **SVG or PNG** with a transparent background: the staff, the circle, the guitar, the piano, the isomorphic keyboard.

## Screen recordings

Presentation mode (`P`) fills the screen with the current layout and no controls: good for recording the screen directly.
