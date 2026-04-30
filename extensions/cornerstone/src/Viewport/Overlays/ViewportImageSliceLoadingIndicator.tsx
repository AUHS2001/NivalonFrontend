import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Enums } from '@cornerstonejs/core';

function ViewportImageSliceLoadingIndicator({ viewportData, element }) {
  const [loading, setLoading] = useState(false);
  const [lazyLoading, setLazyLoading] = useState(false);
  const [lazyProgress, setLazyProgress] = useState(0);
  const [error, setError] = useState(false);

  const loadIndicatorRef = useRef(null);
  const imageIdToBeLoaded = useRef(null);

  const setLoadingState = evt => {
    clearTimeout(loadIndicatorRef.current);

    loadIndicatorRef.current = setTimeout(() => {
      setLoading(true);
    }, 50);
  };

  const setFinishLoadingState = evt => {
    clearTimeout(loadIndicatorRef.current);

    setLoading(false);
  };

  const setErrorState = evt => {
    clearTimeout(loadIndicatorRef.current);

    if (imageIdToBeLoaded.current === evt.detail.imageId) {
      setError(evt.detail.error);
      imageIdToBeLoaded.current = null;
    }
  };

  useEffect(() => {
    element.addEventListener(Enums.Events.STACK_VIEWPORT_SCROLL, setLoadingState);
    element.addEventListener(Enums.Events.IMAGE_LOAD_ERROR, setErrorState);
    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, setFinishLoadingState);

    return () => {
      element.removeEventListener(Enums.Events.STACK_VIEWPORT_SCROLL, setLoadingState);

      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, setFinishLoadingState);

      element.removeEventListener(Enums.Events.IMAGE_LOAD_ERROR, setErrorState);
    };
  }, [element, viewportData]);

  // Listen for lazy-load viewport loading events (triggered by drag-and-drop)
  useEffect(() => {
    const onStart = (e: CustomEvent) => {
      setLazyLoading(true);
      setLazyProgress(0);
    };

    const onProgress = (e: CustomEvent) => {
      const { progress } = e.detail || {};
      if (typeof progress === 'number') {
        setLazyProgress(Math.round(progress * 100));
        if (progress >= 1) {
          setLazyLoading(false);
        }
      }
    };

    const onComplete = () => {
      setLazyLoading(false);
      setLazyProgress(0);
    };

    window.addEventListener('dicom-viewport-loading-start', onStart as EventListener);
    window.addEventListener('dicom-viewport-loading-progress', onProgress as EventListener);
    window.addEventListener('dicom-viewport-loading-complete', onComplete as EventListener);

    return () => {
      window.removeEventListener('dicom-viewport-loading-start', onStart as EventListener);
      window.removeEventListener('dicom-viewport-loading-progress', onProgress as EventListener);
      window.removeEventListener('dicom-viewport-loading-complete', onComplete as EventListener);
    };
  }, []);

  if (error) {
    return (
      <>
        <div className="absolute top-0 left-0 h-full w-full bg-black opacity-50">
          <div className="transparent flex h-full w-full items-center justify-center">
            <p className="text-primary-light text-xl font-light">
              <h4>Error Loading Image</h4>
              <p>An error has occurred.</p>
              <p>{error}</p>
            </p>
          </div>
        </div>
      </>
    );
  }

  if (lazyLoading) {
    return (
      <div className="pointer-events-none absolute top-0 left-0 h-full w-full bg-black opacity-50">
        <div className="transparent flex h-full w-full flex-col items-center justify-center">
          <p className="text-primary-light text-xl font-light">Loading series...</p>
          <p className="text-primary-light mt-2 text-sm font-light">{lazyProgress}%</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      // IMPORTANT: we need to use the pointer-events-none class to prevent the loading indicator from
      // interacting with the mouse, since scrolling should propagate to the viewport underneath
      <div className="pointer-events-none absolute top-0 left-0 h-full w-full bg-black opacity-50">
        <div className="transparent flex h-full w-full items-center justify-center">
          <p className="text-primary-light text-xl font-light">Loading...</p>
        </div>
      </div>
    );
  }

  return null;
}

ViewportImageSliceLoadingIndicator.propTypes = {
  error: PropTypes.object,
  element: PropTypes.object,
};

export default ViewportImageSliceLoadingIndicator;
