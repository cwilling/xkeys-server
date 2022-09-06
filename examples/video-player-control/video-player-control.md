## Remote control of video playback
This example shows how any X-keys device with a shuttle control may control a local or remote instance of the **mpv** video player. The control device must be plugged into a machine running the **xkeys-server**. The **mpv** instance can run on any machine (Linux, RPI, Windows) in the same local area network - no _xkeys-server_ needed. When the mpv_transport.js script is run, it seeks out and connects to the machine with the controller and redirects any commands it receives from the contrroller to the **mpv** instance.

### Requirements
For the controlling machine:
- X-keys device with jog/shuttle control e.g. XK-12 Jog-Shuttle, XK-68 Jog-Shuttle, XKE-64 Jog T-bar, X-blox XBA-4x3 Jog-Shuttle Module
- _xkeys-server_ software running

For the video replay machine:
- _mpv_ video player software
- _xdotool_ software (or, on Windows machines, AutoHotkey software)
- _nodejs_ software to run the _mpv\_transport.js_ script provided here.

\*Note that the controlling machine and the video replay machine could be the same machine

### Procedure
First, keybindings must be provided for _mpv_ to enable the desired jog & shuttle functionality. These keybindings are contained in the [_input.conf_](examples/input.conf) file which can either be copied, as is, to the correct location or its contents may be merged with any already existing input.conf file. On Linux machines, the location is in the ~/.conf/mpv directory (which should be created when _mpv_ is run for the first time). On Windows, the _input.conf_ should be in the _C:\users\USERNAME\AppData\Roaming\mpv_ directory.

On Windows machines only, compile the [_AutoHotkey.ahk_](examples/video-player-control/AutoHotkey.ahk) in this directory to generate an _AutoHotkey.exe_ file (select AutoHotkey.ahk in the file browser, right click on it and select _Compile_ from the context menu).

Next, run a video file with _mpv_. Then run the [mpv_transport.js](examples/video-player-control/mpv_transport.js) script in this directory from a command prompt with something like:
```
    node ./mpv_transport.js
```
From now on, changes of the jog & shuttle controls should appropriately influence video playback behaviour. In addition, the four keys immediately about the shuttle wheel will also change the playback. Functions of these buttons are (starting with the leftmost button):
- halve the current playback speed
- revert to normal (x1) playback speed
- toggle start/stop
- double the current playback speed

### Caveats
Reverse shuttle is problematic for high bit-rate video. This can depend somewhat on the capability of the playback machine. Bit rates lower than 20Mbits are more likely to played in reverse successfully.


