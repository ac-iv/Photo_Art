<script>
    const FPS = 60;
    const DPF = 512; // dots per frame

    const drawFnHash = {};

    drawFnHash.emoji = function ({
        ctx,
        cx,
        cy,
        s,
        kernel
    }) {
        const r = (kernel) * (1 - s);
        const ch = "🐱";
        ctx.font = `${r}px monospace`;
        ctx.fillText(ch, cx - kernel / 2, cy + kernel / 2);
    }

    drawFnHash.char = function ({
        ctx,
        cx,
        cy,
        s,
        kernel
    }) {
        const base = kernel * 2;
        const fontsize = base * (1 - s);
        const ch = String.fromCodePoint(65 + Math.random() * 26 | 0);
        ctx.font = `${fontsize}px monospace`;
        ctx.fillText(ch, cx - (fontsize * 0.8) / 2, cy + fontsize / 2);
    }

    drawFnHash.dots = function ({
        ctx,
        cx,
        cy,
        s,
        kernel
    }) {
        const r = (kernel / 2) * (1 - s); // no overlap
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r, 0, 0, 2 * Math.PI)
        ctx.fill();
        ctx.closePath();
    };

    drawFnHash.line = function ({
        ctx,
        cx,
        cy,
        s,
        kernel
    }) {
        const r = (kernel / 2) * (1 - s);
        ctx.beginPath();
        ctx.moveTo(cx - kernel / 2, cy - kernel / 2);
        ctx.lineTo(cx + kernel / 2, cy + kernel / 2);
        ctx.lineWidth = r;
        ctx.stroke();
        ctx.closePath();
    }

    // Other codes remain the same

    const elImageInput = document.getElementById('elImageInput');
    const elImg = document.getElementById('elImg');
    const elFrame = document.getElementById('elFrame');

    elImageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = function (event) {
            elImg.src = event.target.result;
            applyEffects(elImg);
        };

        reader.readAsDataURL(file);
    });

    const elStyle = document.getElementById('elStyle');
    const elKernel = document.getElementById('elKernel');

    elStyle.addEventListener("input", onInput);
    elKernel.addEventListener("input", onInput);
    onInput();

    function onInput() {
        const index = elStyle.selectedIndex;
        const imgsrc = elImg.src;
        const oldCanvas = elFrame.querySelector("canvas");

        if (oldCanvas != null)
            elFrame.removeChild(oldCanvas);

        if (index === 0) {
            elImg.classList.add("show");
            return;
        }

        const drawFn = drawFnHash[elStyle.children[index].value];
        const kernel = Number(elKernel.value);
        const frameEl = elFrame;
        elImg.classList.remove("show");

        fx({
                frameEl,
                drawFn,
                kernel,
                imgsrc
            })
            .then(onDone)
            .catch(onError);
    }

    function applyEffects(image) {
        const elStyle = document.getElementById('elStyle');
        const elKernel = document.getElementById('elKernel');
        const index = elStyle.selectedIndex;
        const imgsrc = image.src;

        if (index === 0) {
            return;
        }

        const drawFn = drawFnHash[elStyle.children[index].value];
        const kernel = Number(elKernel.value);
        const frameEl = elFrame;

        fx({
                frameEl,
                drawFn,
                kernel,
                imgsrc
            })
            .then(onDone)
            .catch(onError);
    }

    function onDone({
        onCanvas
    }) {
        enableAllControls();
    }

    function onError(err) {
        console.error(err);
        for (const optionEl of Array.from(elStyle.children))
            optionEl.selected = false;
        elStyle.children[0].selected = true; // original
        enableAllControls();
    }

    function enableAllControls() {
        elStyle.disabled = false;
        elKernel.disabled = false;
    }

    function disableAllControls() {
        elStyle.disabled = true;
        elKernel.disabled = true;
    }

    function fx({
        frameEl,
        drawFn,
        kernel,
        imgsrc
    }) {
        const el = frameEl.querySelector("img");
        return Promise.resolve(imgsrc)
            .then(toImage())
            .then(setup({
                el
            }))
            .then(halftone({
                kernel
            }))
            .then(render({
                dotsPerFrame: DPF,
                fps: FPS,
                drawFn
            }));
    }

    function toImage() {
        return function (url) {
            return new Promise(function (resolve, reject) {
                const image = new Image();
                image.addEventListener("load", e => resolve(image));
                image.addEventListener("error", e => reject(e));
                image.src = url;
            });
        }
    }

    function halftone({
        kernel = 10
    }) {
        function grayscale({
            r,
            g,
            b
        }) {
            return 0.2 * r / 255 + 0.7 * g / 255 + 0.1 * b / 255;
        }

        function samplize({
            x,
            y,
            imageData
        }) {
            const {
                width,
                height,
                data
            } = imageData;
            const samples = [];
            for (let i = y; i < y + kernel; i++) {
                for (let j = x; j < x + kernel; j++) {
                    const at = (i * width + j) * 4;
                    const r = data[at];
                    const g = data[at + 1];
                    const b = data[at + 2];
                    samples.push({
                        r,
                        g,
                        b
                    });
                }
            }
            let sum = 0;
            for (const sample of samples)
                sum += grayscale(sample);
            return sum / samples.length; // avg
        }

        return function ({
            onCanvas,
            imageData
        }) {
            const halftoneData = {
                kernel: kernel,
                width: imageData.width / kernel | 0,
                height: imageData.height / kernel | 0,
                data: []
            };

            for (let y = 0; y <= imageData.height - kernel; y += kernel) {
                for (let x = 0; x <= imageData.width - kernel; x += kernel) {
                    halftoneData.data.push(samplize({
                        x,
                        y,
                        imageData
                    }));
                }
            }

            return {
                halftoneData,
                onCanvas
            };
        };
    }

    function render({
        dotsPerFrame = 1,
        fps = 10,
        drawFn
    }) {
        return function ({
            halftoneData,
            onCanvas
        }) {
            return new Promise((resolve, reject) => {
                const ctx = onCanvas.getContext("2d");
                const {
                    width,
                    height,
                    kernel,
                    data
                } = halftoneData;
                const dotsCount = width * height;

                let dotsDrawn = 0;
                (function tick() {
                    for (let i = 0; i < dotsPerFrame && dotsDrawn < dotsCount; i++) {
                        const cx = (dotsDrawn % width) * kernel + kernel / 2;
                        const cy = (dotsDrawn / width | 0) * kernel + kernel / 2;
                        const s = data[dotsDrawn];
                        drawFn({
                            ctx,
                            cx,
                            cy,
                            s,
                            kernel
                        });
                        dotsDrawn += 1;
                    }

                    if (dotsDrawn < dotsCount)
                        setTimeout(tick, 1000 / fps);
                    else
                        resolve({
                            onCanvas
                        });
                }());
            });
        }
    }

    function setup({
        el
    }) {
        return function (image) {
            const onCanvas = document.createElement("canvas");
            onCanvas.width = image.width;
            onCanvas.height = image.height;
            const onContext = onCanvas.getContext("2d");
            onContext.fillStyle = "white";
            onContext.fillRect(0, 0, onCanvas.width, onCanvas.height);
            onContext.fillStyle = "black";
            el.parentNode.appendChild(onCanvas);

            const offCanvas = document.createElement("canvas");
            offCanvas.width = onCanvas.width;
            offCanvas.height = onCanvas.height;
            const offContext = offCanvas.getContext("2d");
            offContext.drawImage(image, 0, 0, offCanvas.width, offCanvas.height);
            const imageData = offContext.getImageData(0, 0, offCanvas.width, offCanvas.height);

            return {
                onCanvas,
                imageData
            };
        }
    }

    // Function to download canvas as PNG
    document.getElementById('downloadPNG').addEventListener('click', function () {
        const canvas = document.getElementById('elFrame').querySelector('canvas');
        const link = document.createElement('a');
        link.download = 'artwork.png';
        link.href = canvas.toDataURL();
        link.click();
    });

    // Function to download canvas as SVG
    document.getElementById('downloadSVG').addEventListener('click', function () {
        const canvas = document.getElementById('elFrame').querySelector('canvas');
        const link = document.createElement('a');
        link.download = 'artwork.svg';
        link.href = 'data:image/svg+xml,' + encodeURIComponent(canvas.toSVG());
        link.click();
    });
</script>