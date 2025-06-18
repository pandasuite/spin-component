/* eslint-disable no-undef */
import PandaBridge from 'pandasuite-bridge';
import sortBy from 'lodash/sortBy';
import find from 'lodash/find';

import './index.css';

let properties = null;
let markers = null;

let oldAngle = 0;
let tween;
let currentRotation = 0;

function mod(n, m) {
  return ((n % m) + m) % m;
}

function isRotationBounds() {
  return properties.limitRotation;
}

function isValueInRange(
  testValue,
  currentValue,
  oldValue,
  minBorder,
  maxBorder
) {
  const minvalue = Math.min(oldValue, currentValue);
  const maxvalue = Math.max(oldValue, currentValue);

  if (oldValue === undefined) {
    return Math.abs(testValue - currentValue) < 0.001;
  }

  const isLooping =
    Math.abs(oldValue - currentValue) > (maxBorder - minBorder) * 0.85 &&
    oldValue !== -1 &&
    !isRotationBounds();

  return (
    (isLooping &&
      ((testValue > maxvalue && testValue <= maxBorder) ||
        (testValue >= minBorder && testValue <= minvalue))) ||
    (!isLooping &&
      ((oldValue <= currentValue &&
        testValue > minvalue &&
        testValue <= maxvalue) ||
        (oldValue > currentValue &&
          testValue >= minvalue &&
          testValue < maxvalue)))
  );
}

function onRotate(angle, fromSynchro, final) {
  /* Markers */
  if (markers) {
    markers.forEach((marker) => {
      if (
        (!marker.final || (marker.final && final)) &&
        ((marker.absolute &&
          isValueInRange(
            mod(marker.angle, 360),
            mod(angle, 360),
            final ? undefined : mod(oldAngle, 360),
            0,
            360
          )) ||
          (!marker.absolute &&
            isValueInRange(
              marker.angle,
              angle,
              final ? undefined : oldAngle,
              0,
              360
            )))
      ) {
        PandaBridge.send('triggerMarker', marker.id);
      }
    });
  }

  /* Synchronisation status */
  if (!fromSynchro) {
    let value = 0;

    if (isRotationBounds()) {
      value =
        ((angle - properties.minRotation) * 100) /
        (properties.maxRotation - properties.minRotation);
    } else {
      value = mod(value, 360) / 360;
    }
    PandaBridge.send('synchronize', [value, 'synchroRotation', true]);
  }

  oldAngle = angle;
}

function rotate(angle, duration, fromSynchro) {
  const overideRotateZeroBug = angle === 0 && duration === 0;
  let needToDispatchStart = true;

  Draggable.get('#container').update();
  if (tween && tween.isActive()) {
    needToDispatchStart = false;
  }

  tween = TweenLite.to('#container', duration, {
    rotation: overideRotateZeroBug ? 0.00001 : angle,
    onStart() {
      if (needToDispatchStart) {
        PandaBridge.send('onRotationStart');
      }
    },
    onComplete() {
      if (!overideRotateZeroBug) {
        onRotate(0, fromSynchro);
      }
      PandaBridge.send('onRotationEnd');
    },
    onUpdate() {
      if (!overideRotateZeroBug) {
        // eslint-disable-next-line no-underscore-dangle
        onRotate(this.target[0]._gsTransform.rotation, fromSynchro);
      }
    },
  });
}

function myInit() {
  const rotatedImage = PandaBridge.resolvePath('my_image.png', './knob.png');
  document.getElementById(
    'container'
  ).style.backgroundImage = `url(${rotatedImage})`;

  const draggableProperties = {
    type: 'rotation',
    throwProps: properties.throwProps,
    throwResistance: properties.throwResistance,
    edgeResistance: 0.85,
    onThrowUpdate() {
      onRotate(this.rotation);
    },
    onDragStart() {
      PandaBridge.send('onDragStart');
      PandaBridge.send('onRotationStart');
    },
    onDragEnd() {
      PandaBridge.send('onDragEnd');
    },
    onThrowComplete() {
      onRotate(this.rotation, false, true);
      PandaBridge.send('onRotationEnd');
    },
    onDrag() {
      onRotate(this.rotation);
    },
    snap(endValue) {
      if (properties.snap === 'degree') {
        if (properties.progressiveSnap) {
          let newRotation =
            Math.round(this.rotation / properties.rotationSnap) *
            properties.rotationSnap;
          if (newRotation > endValue && endValue < this.rotation) {
            newRotation -= properties.rotationSnap;
          } else if (newRotation < endValue && endValue > this.rotation) {
            newRotation += properties.rotationSnap;
          }
          return newRotation;
        }
        return (
          Math.round(endValue / properties.rotationSnap) *
          properties.rotationSnap
        );
      }
      if (properties.snap === 'marker') {
        const minEndValue = Math.floor(endValue / 360);
        const maxEndValue = Math.ceil(endValue / 360);

        const gaps = sortBy(
          markers.map((marker) => {
            const minValue = (marker.angle % 360) + minEndValue * 360;
            const minDistance = Math.abs(minValue - endValue);
            const maxValue = (marker.angle % 360) + maxEndValue * 360;
            const maxDistance = Math.abs(maxValue - endValue);

            if (minDistance < maxDistance) {
              return [minDistance, minValue];
            }
            return [maxDistance, maxValue];
          }),
          0
        );

        const gap = find(gaps, (g) => {
          if (properties.progressiveSnap) {
            return (
              (g[1] >= endValue && endValue >= this.rotation) ||
              (g[1] <= endValue && endValue <= this.rotation)
            );
          }
          return true;
        });

        if (gap) {
          return gap[1];
        }
        return gaps[gaps.length - 1][1] - 360;
      }
      return endValue;
    },
  };

  if (isRotationBounds()) {
    properties.minRotation = properties.minRotation || 0;
    properties.maxRotation = properties.maxRotation || 360;

    draggableProperties.bounds = {
      minRotation: properties.minRotation,
      maxRotation: properties.maxRotation,
    };
  }
  Draggable.create('#container', draggableProperties);
}

PandaBridge.init(() => {
  PandaBridge.onLoad((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    if (document.readyState === 'complete') {
      myInit();
    } else {
      document.addEventListener('DOMContentLoaded', myInit, false);
    }
  });

  PandaBridge.onUpdate((pandaData) => {
    properties = pandaData.properties;
    markers = pandaData.markers;

    Draggable.get('#container').kill();
    myInit();
  });

  /* Markers */

  PandaBridge.getSnapshotData(() => ({
    angle: Draggable.get('#container').rotation,
  }));

  PandaBridge.setSnapshotData(({ data, params }) => {
    rotate(data.angle, params.duration || 0);
  });

  /* Actions */

  PandaBridge.listen('rotateBy', (args) => {
    const props = args[0] || {};

    Draggable.get('#container').update();

    let refRotation = Draggable.get('#container').rotation;
    if (
      tween &&
      tween.isActive() &&
      tween.vars &&
      tween.vars.css &&
      tween.vars.css.rotation !== undefined
    ) {
      refRotation = tween.vars.css.rotation;
    }

    let newAngle = refRotation + props.angle;
    if (isRotationBounds()) {
      newAngle = Math.min(
        Math.max(properties.minRotation, newAngle),
        properties.maxRotation
      );
    }
    rotate(newAngle, props.duration);
  });

  PandaBridge.synchronize('synchroRotation', (percent) => {
    let angle;

    if (isRotationBounds()) {
      angle =
  PandaBridge.synchronize('synchroRotation', (percent) => {
    let targetAngle;
    if (isRotationBounds()) {
      targetAngle =
        properties.minRotation +
        (percent * (properties.maxRotation - properties.minRotation)) / 100;
    } else {
      targetAngle = (percent * 360) / 100;
    }

    let diff = targetAngle - (currentRotation % 360);

    if (diff < 0) diff += 360;

    currentRotation += diff;

    TweenLite.to('#container', 0.1, {
      rotation: currentRotation,
    });
  });
});
