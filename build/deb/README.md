# Packaging for _apt_ based package managers

This is the directory from which installable _.deb_ packages are created for Linux distros using _apt_ based package managers. To create a package, run the make-deb script here on an approriate machine, passing the script the desired package VERSION number and machine ARCH e.g.
```
    ./make-deb 1.0.0 amd64
```
