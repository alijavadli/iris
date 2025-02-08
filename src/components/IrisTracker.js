import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import {
  Camera as CameraIcon,
  Share as ShareIcon,
  X as XIcon,
  Info as InfoIcon,
} from "react-feather";
import axios from "axios";

const IrisTracker = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const faceMeshRef = useRef(null);

  const [irisImages, setIrisImages] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedIris, setSelectedIris] = useState("iris1");
  const [density, setDensity] = useState(0.4);
  const [faceDetected, setFaceDetected] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [dropdownStates, setDropdownStates] = useState({
    iris: false,
    density: false,
  });

  const selectedIrisRef = useRef(selectedIris);
  const densityRef = useRef(density);

  const [irises, setIrises] = useState([]);

  useEffect(() => {
    selectedIrisRef.current = selectedIris;
  }, [selectedIris]);

  useEffect(() => {
    densityRef.current = density;
  }, [density]);

  useEffect(() => {
    const fetchIrises = async () => {
      try {
        const response = await axios.get("https://saglamgoz.az/api/irises");
        if (response.data.success) {
          const irisData = response.data.data.map((iris) => ({
            id: iris.id.toString(),
            title: iris.title,
            image: `https://saglamgoz.az/storage/${iris.image}`,
          }));
          setIrises(irisData);

          if (irisData.length > 0) {
            setSelectedIris(irisData[0].id);

            loadIrisImages(irisData)
              .then((images) => {
                setIrisImages(images);
                setIsLoaded(true);
              })
              .catch((error) => {
                console.error("Error loading iris images:", error);
                setErrorMessage(
                  "Failed to load iris images. Please refresh and try again."
                );
              });
          }
        }
      } catch (error) {
        console.error("Failed to fetch irises:", error);
        setErrorMessage(
          "Failed to load iris data. Please check your internet connection and try again."
        );
      }
    };

    fetchIrises();
  }, []);

  const loadIrisImages = async (irisData) => {
    try {
      const loadedImages = {};
      await Promise.all(
        irisData.map(async (iris) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = iris.image;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(`Failed to load image: ${iris.image}`);
          });
          loadedImages[iris.id] = img;
        })
      );
      return loadedImages;
    } catch (error) {
      throw new Error("Failed to load iris images: " + error.message);
    }
  };

  const LEFT_IRIS_POINTS = [
    33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7,
  ];
  const RIGHT_IRIS_POINTS = [
    263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390,
    249,
  ];

  const clipEyeShape = (ctx, landmarks, points, width, height) => {
    ctx.beginPath();
    points.forEach((index, i) => {
      const point = landmarks[index];
      const x = point.x * width;
      const y = point.y * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.clip();
  };

  const drawSingleIris = (
    ctx,
    irisPoints,
    irisImage,
    landmarks,
    isLeft,
    opacity
  ) => {
    if (!irisPoints || irisPoints.length < 5) return;

    const { width, height } = ctx.canvas;

    let centerX = 0,
      centerY = 0;
    irisPoints.forEach((point) => {
      centerX += point.x;
      centerY += point.y;
    });
    centerX = (centerX / irisPoints.length) * width;
    centerY = (centerY / irisPoints.length) * height;

    let radius = 0;
    irisPoints.forEach((point) => {
      const dx = point.x * width - centerX;
      const dy = point.y * height - centerY;
      radius += Math.sqrt(dx * dx + dy * dy);
    });
    radius = (radius / irisPoints.length) * 1.45;
    const irisSize = radius * 2;

    const x = centerX - radius;
    const y = centerY - radius;

    const eyePoints = isLeft ? LEFT_IRIS_POINTS : RIGHT_IRIS_POINTS;

    ctx.save();

    clipEyeShape(ctx, landmarks, eyePoints, width, height);

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.globalAlpha = opacity;
    ctx.drawImage(irisImage, x, y, irisSize, irisSize);

    ctx.restore();
  };

  const drawIris = useCallback(
    (ctx, landmarks, irisId, opacity) => {
      const leftIrisPoints = landmarks.slice(468, 473);
      const rightIrisPoints = landmarks.slice(473, 478);

      drawSingleIris(
        ctx,
        leftIrisPoints,
        irisImages[irisId],
        landmarks,
        true,
        opacity
      );
      drawSingleIris(
        ctx,
        rightIrisPoints,
        irisImages[irisId],
        landmarks,
        false,
        opacity
      );
    },
    [irisImages]
  );

  const onResults = useCallback(
    (results) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const selectedIrisId = selectedIrisRef.current;
      const currentDensity = densityRef.current;

      canvas.width = webcamRef.current.video.videoWidth;
      canvas.height = webcamRef.current.video.videoHeight;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (!cameraStarted) {
        setCameraStarted(true);
      }

      let faceFound = false;

      if (results.multiFaceLandmarks?.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        if (irisImages[selectedIrisId]) {
          drawIris(ctx, landmarks, selectedIrisId, currentDensity);
          faceFound = true;
        }
      }

      ctx.restore();
      setFaceDetected(faceFound);
    },
    [cameraStarted, drawIris, setCameraStarted, setFaceDetected]
  );

  const initFaceMesh = useCallback(() => {
    const faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults(onResults);
    faceMeshRef.current = faceMesh;
  }, [onResults]);

  useEffect(() => {
    if (isLoaded) {
      initFaceMesh();
    }
  }, [isLoaded, initFaceMesh]);

  const startCamera = () => {
    if (webcamRef.current && webcamRef.current.video) {
      try {
        const camera = new Camera(webcamRef.current.video, {
          onFrame: async () => {
            if (faceMeshRef.current) {
              await faceMeshRef.current.send({
                image: webcamRef.current.video,
              });
            }
          },
          width: 1280,
          height: 720,
        });

        camera.start().catch((error) => {
          console.error("Failed to start camera feed:", error);
          setErrorMessage(
            "Could not start camera. Please allow camera access or try a different device."
          );
        });
      } catch (error) {
        console.error("Camera initialization error:", error);
        setErrorMessage(
          "Could not initialize camera. Please check your device permissions."
        );
      }
    } else {
      console.warn("No webcam video found.");
    }
  };

  const takeScreenshot = async () => {
    if (!canvasRef.current || !webcamRef.current || isCapturing) return;

    setIsCapturing(true);
    setCountdown(4);

    const capturePromise = new Promise((resolve) => {
      setTimeout(async () => {
        const canvas = canvasRef.current;
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          setScreenshotUrl(url);
          resolve();
        }, "image/png");
      }, 500);
    });

    const countdownPromise = new Promise((resolve) => {
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === 1) {
            clearInterval(interval);
            resolve();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    await Promise.all([capturePromise, countdownPromise]);
    setShowScreenshot(true);
    setIsCapturing(false);
  };

  const toggleDropdown = (type) => {
    setDropdownStates((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  return (
    <div className="iris-tracker-container">
      {/* Header */}
      <div className="header">
        <div className="d-flex">
          <img src="https://drcahid.com/templates/en/wp-content/uploads/sites/3/2018/06/logo-white.png" alt="Dr Cahid Logo" className="clinic-logo" style={{width: "160px"}} />
        </div>
        <button className="info-button" onClick={() => setShowInfo(true)}>
          <InfoIcon size={24} />
        </button>
      </div>

      {errorMessage && <p className="error-message">{errorMessage}</p>}

      {!isLoaded && (
        <p className="loader-message">Loading iris images... Please wait.</p>
      )}

      {isLoaded && isStarting && (
        <p className="loader-message">
          Accessing camera... Please allow camera permissions if prompted.
        </p>
      )}

      <div className="camera-container" style={{ position: "relative" }}>
        {(isStarting || !isLoaded || !cameraStarted) && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>
              {isLoaded
                ? cameraStarted
                  ? "Accessing camera... Please wait."
                  : "Starting camera... please wait."
                : "Loading iris images... Please wait."}
            </p>
          </div>
        )}

        <Webcam
          ref={webcamRef}
          audio={false}
          onUserMedia={() => {
            setIsStarting(false);
            startCamera();
          }}
          onUserMediaError={(error) => {
            console.error("Webcam error:", error);
            setIsStarting(false);
            setCameraStarted(true);
            setErrorMessage(
              "Could not access camera. Please allow permissions or check your device settings."
            );
          }}
          videoConstraints={{ facingMode: "user" }}
          style={{ visibility: "hidden", transform: "scaleX(-1)" }}
        />

        <canvas ref={canvasRef} className="video-canvas" />

        <button
          className="capture-button"
          onClick={takeScreenshot}
          disabled={!faceDetected || isCapturing}
        >
          {countdown > 0 ? <span>{countdown}</span> : <CameraIcon size={24} />}
        </button>

        <div className="controls-overlay">
          <div className="controls-wrapper">
            <div className="dropdown">
              <button
                onClick={() => toggleDropdown("iris")}
                className="dropdown-button"
              >
                <img
                  src={irises.find((i) => i.id === selectedIris)?.image}
                  alt={irises.find((i) => i.id === selectedIris)?.title}
                  className="dropdown-image"
                />
                <span>{irises.find((i) => i.id === selectedIris)?.title}</span>
              </button>
              {dropdownStates.iris && (
                <div className="dropdown-menu">
                  {irises.map((iris) => (
                    <div
                      key={iris.id}
                      className={`dropdown-item ${
                        selectedIris === iris.id ? "selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedIris(iris.id);
                        toggleDropdown("iris");
                      }}
                    >
                      <img
                        src={iris.image}
                        alt={iris.title}
                        className="dropdown-image"
                      />
                      <span>{iris.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dropdown">
              <button
                onClick={() => toggleDropdown("density")}
                className="dropdown-button"
              >
                <span>Density:</span>
                <span>
                  {density === 0.2
                    ? "Low"
                    : density === 0.4
                    ? "Medium"
                    : "High"}
                </span>
              </button>
              {dropdownStates.density && (
                <div className="dropdown-menu">
                  {[
                    { value: 0.2, label: "Low" },
                    { value: 0.4, label: "Medium" },
                    { value: 0.7, label: "High" },
                  ].map((option) => (
                    <div
                      key={option.value}
                      className={`dropdown-item ${
                        density === option.value ? "selected" : ""
                      }`}
                      onClick={() => {
                        setDensity(option.value);
                        toggleDropdown("density");
                      }}
                    >
                      <span>{option.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showScreenshot && screenshotUrl && (
        <div className="screenshot-modal">
          <div className="screenshot-content">
            <img
              src={screenshotUrl}
              alt="SaglamGoz iris"
              onLoad={(e) => e.target.classList.add("loaded")}
              crossOrigin="anonymous"
            />
            <div className="screenshot-buttons">
              <button onClick={() => setShowScreenshot(false)}>
                <XIcon />
              </button>
              <button
                onClick={() => {
                  if (screenshotUrl) {
                    if (navigator.share) {
                      fetch(screenshotUrl)
                        .then((res) => res.blob())
                        .then((blob) => {
                          const file = new File([blob], "saglamgoz.png", {
                            type: "image/png",
                          });
                          navigator
                            .share({
                              title: "SaglamGoz Image",
                              text: "Check out this image from SaglamGoz!",
                              files: [file],
                            })
                            .then(() =>
                              console.log("Screenshot shared successfully")
                            )
                            .catch((error) =>
                              console.error("Error sharing screenshot:", error)
                            );
                        })
                        .catch((error) =>
                          console.error("Error creating shareable file:", error)
                        );
                    } else {
                      const a = document.createElement("a");
                      a.href = screenshotUrl;
                      a.download = "saglamgoz.png";
                      a.click();
                    }
                  }
                }}
              >
                <ShareIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bilgi Modalı */}
      {showInfo && (
        <div className="info-modal">
          <div className="info-content">
            <h2>Welcome to Demo Eyes simulator!</h2>
            <p>
              This simulator gives you a real-time overview of how your eyes
              could look with Demo colors.
            </p>
            <br />
            <p>
              <strong>How to use it?</strong>
            </p>
            <ul>
              <li>
                💡 Ensure you're in a bright environment (sunlight gives the
                best results)
              </li>
              <li>🧑 Stay ~40cm away from your camera</li>
              <li>
                📸 Keep steady, take a picture and try out all our colors!
              </li>
            </ul>
            <button onClick={() => setShowInfo(false)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IrisTracker;
