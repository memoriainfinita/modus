# Transcribing

Work out the chords of a song and see the harmony of what you find.

## From a recording

1. Pick the **Transcription** layout in the ▦ menu.
2. In the **Player**, open an audio file (or drop it on the panel). The file is not kept across reloads.
3. Click the waveform to go anywhere. Set an **A–B loop** on the passage, slow it down from 50 to 125 % — the pitch does not change — and use *back 5 s* to hear it again.
4. With **Chords** on, Modus reads the chord at the playhead and sends it to the detector: it is analysed, logged in the history and read in the key like anything you play.

Chords are read by a model (Spotify's Basic Pitch) running in your browser; nothing is uploaded. It was measured on synthesized guitar strums and is least certain on dense mixes, so treat it as a first guess to check with your ear.

## By ear, on an instrument

Play what you hear on a MIDI keyboard, the computer keyboard (`M`) or the piano panel, and read the name. With the key on **Auto**, Modus finds the key from the chords you have played so far.

With the 🎤 **microphone**, one note at a time (a voice, a wind instrument) goes to the detector and to **Fits**, which lists the scales that contain the melody; chords played near the microphone are read too, under a second behind. The **Tuner** shows the note, the cents and the frequency. The microphone needs HTTPS or `localhost`.

## Keep what you find

Every chord is logged in the **History** after 0.8 s of stability, with its numeral and the cadences and modulations between chips. Click a chip to see it again; drag it onto a measure of the **Song** to keep it. You can also type a chord (`/`).

When you are done, the Song prints as a chord chart. See [Composing](composing.md).
