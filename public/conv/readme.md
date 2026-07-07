1. install gifski.msi & add path to "PATH" variable
2. unzip zip file, drag & drop to the git_bash, run command
```
boston@DESKTOP-FH3S95J MINGW64 ~/Downloads/bin
$ /c/Users/boston/Downloads/bin/lottie_to_gif.sh path 1.json
```

```
// this is the help command
$ ./bin/lottie_to_gif.sh -h                       
usage: ./bin/lottie_to_gif.sh [--help] [--output OUTPUT] [--height HEIGHT] [--width WIDTH] [--threads THREADS] [--fps FPS] [--quality QUALITY] [--background BACKGROUND] path

Lottie animations (.json) and Telegram stickers for Telegram (*.tgs) to animated .gif converter

Positional arguments:
path              Path to .json or .tgs file to convert

Optional arguments:
-h, --help        show this help message and exit
--output OUTPUT   Output file path
--height HEIGHT   Output image height. Default: 
--width WIDTH     Output image width. Default: 512
--fps FPS         Output frame rate. Default: 50
--threads THREADS Number of threads to use. Default: number of CPUs
--quality QUALITY Output quality. Default: 90
--background BACKGROUND Background color to replace transparent pixels. Formats: rgb(r,g,b), rgba(r,g,b,a), #RRGGBB, #RRGGBBAA
```
3. you can see two changes - gif.ski is running & 1.json.gif.11384.tmp folder is created. drag & drop that folder to the gif.ski, you can get the final result .gif file.
