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
let infiniteTween = null;

function mod(n, m) {
  return ((n % m) + m) % m;
}

function getReferenceRotation(isActive) {
  let refRotation = Draggable.get('#container').rotation;
  if (
    tween &&
    isActive &&
    tween.vars &&
    tween.vars.css &&
    tween.vars.css.rotation !== undefined
  ) {
    refRotation = tween.vars.css.rotation;
  }
  return refRotation;
}

function isRotationBounds() {
  return properties.limitRotation;
}

function applySnapLogic(endValue, fromRotation) {
  if (properties.snap === 'degree') {
    if (properties.progressiveSnap) {
      let newRotation =
        Math.round(fromRotation / properties.rotationSnap) *
        properties.rotationSnap;
      if (newRotation > endValue && endValue < fromRotation) {
        newRotation -= properties.rotationSnap;
      } else if (newRotation < endValue && endValue > fromRotation) {
        newRotation += properties.rotationSnap;
      }
      return newRotation;
    }
    return (
      Math.round(endValue / properties.rotationSnap) * properties.rotationSnap
    );
  }
  if (properties.snap === 'marker' && markers) {
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
          (g[1] >= endValue && endValue >= fromRotation) ||
          (g[1] <= endValue && endValue <= fromRotation)
        );
      }
      return true;
    });

    if (gap) {
      const [, angle] = gap;
      return angle;
    }
    const [, angle] = gaps[gaps.length - 1];
    return angle - 360;
  }
  return endValue;
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

function rotate(angle, duration, fromSynchro, sendEvents = true) {
  const overideRotateZeroBug = angle === 0 && duration === 0;
  let needToDispatchStart = true;

  Draggable.get('#container').update();
  if (tween && tween.isActive()) {
    needToDispatchStart = false;
  }

  tween = TweenLite.to('#container', duration, {
    rotation: overideRotateZeroBug ? 0.00001 : angle,
    onStart() {
      if (needToDispatchStart && sendEvents) {
        PandaBridge.send('onRotationStart');
      }
    },
    onComplete() {
      if (!overideRotateZeroBug) {
        onRotate(0, fromSynchro);
      }
      if (sendEvents) {
        PandaBridge.send('onRotationEnd');
      }
    },
    onUpdate() {
      if (!overideRotateZeroBug) {
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
      return applySnapLogic(endValue, this.rotation);
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

function launchInfiniteRotation(tourDuration) {
  if (infiniteTween) infiniteTween.kill();

  infiniteTween = TweenLite.to('#container', tourDuration, {
    rotation: '+=360',
    ease: Linear.easeNone,
    onUpdate() {
      onRotate(this.target[0]._gsTransform.rotation, false);
    },
    onComplete() {
      launchInfiniteRotation(tourDuration);
    },
  });
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
    const refRotation = getReferenceRotation(true);
    const sendEvents = Boolean(tween && data.angle !== refRotation);
    rotate(data.angle, params.duration || 0, false, sendEvents);
  });

  /* Actions */

  PandaBridge.listen('rotateBy', (args) => {
    if (infiniteTween) {
      infiniteTween.kill();
      infiniteTween = null;
    }

    const props = args[0] || {};

    Draggable.get('#container').update();

    const refRotation = getReferenceRotation(tween && tween.isActive());

    let newAngle = refRotation + props.angle;
    if (isRotationBounds()) {
      newAngle = Math.min(
        Math.max(properties.minRotation, newAngle),
        properties.maxRotation
      );
    }
    rotate(newAngle, props.duration);
  });

  PandaBridge.listen('spinWheel', (args) => {
    if (infiniteTween) {
      infiniteTween.kill();
      infiniteTween = null;
    }

    const props = args[0] || {};
    const velocity = typeof props.velocity === 'number' ? props.velocity : 500;
    const forward = props.forward !== undefined ? props.forward : true;

    Draggable.get('#container').update();

    const startRotation = getReferenceRotation(tween && tween.isActive());

    if (tween && tween.isActive()) {
      tween.kill();
    }

    const baseLoops = 2;
    const extraLoops = Math.max(0, Math.floor(velocity / 400));
    const randomLoops = Math.random() < 0.3 ? 1 : 0; // 30% chance of adding 1 random loop
    const totalLoops = baseLoops + extraLoops + randomLoops;

    const partialRotation = Math.floor(Math.random() * 360);

    let deltaAngle = totalLoops * 360 + partialRotation;
    if (!forward) deltaAngle = -deltaAngle;

    let targetAngle = startRotation + deltaAngle;
    if (isRotationBounds()) {
      targetAngle = Math.min(
        Math.max(properties.minRotation, targetAngle),
        properties.maxRotation
      );
    }

    targetAngle = applySnapLogic(targetAngle, startRotation);

    const durationPerLoop = 0.8;
    let duration = Math.abs(totalLoops) * durationPerLoop;

    const defaultResistance = 10000;
    const resistanceFactor =
      defaultResistance / (properties.throwResistance || defaultResistance);
    duration *= resistanceFactor;
    duration = Math.min(6, Math.max(1.5, duration));

    tween = TweenLite.to('#container', duration, {
      rotation: targetAngle,
      ease: Power4.easeOut,
      onStart() {
        PandaBridge.send('onRotationStart');
      },
      onUpdate() {
        onRotate(this.target[0]._gsTransform.rotation, false);
      },
      onComplete() {
        onRotate(this.target[0]._gsTransform.rotation, false, true);
        PandaBridge.send('onRotationEnd');
      },
    });
  });

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

  PandaBridge.listen('startInfiniteRotation', (args) => {
    const props = args[0] || {};
    const tourDuration =
      typeof props.duration === 'number' && props.duration > 0
        ? props.duration
        : 2;

    if (tween && tween.isActive()) tween.kill();
    if (infiniteTween) infiniteTween.kill();

    launchInfiniteRotation(tourDuration);
  });

  PandaBridge.listen('stopInfiniteRotation', () => {
    if (infiniteTween) {
      infiniteTween.kill();
      infiniteTween = null;
    }
  });
});
