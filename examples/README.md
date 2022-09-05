## Examples
Simple examples demonstrating potential uses of the DCD Protocol.

### 1. Remote control of video playback
This example show how any X-keys device with a shuttle control may control a local or remote instance of the **mpv** video player. The control device must be plugged into a machine running the **xkeys-server**. The **mpv** instance can run on any machine (Linux, RPI, Windows) in the same local area network - no _xkeys-server_ needed. When the mpv_transport.js script is run, it seeks out and connects to the machine with the controller and redirects any commands it receives from the contrroller to the **mpv** instance.