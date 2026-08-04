import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

const stickyClasses = 'sticky top-0';
const notStickyClasses = 'relative';

const NavBar = ({
  className,
  children,
  isSticky,
}: {
  className?: string;
  children?: React.ReactNode;
  isSticky?: boolean;
}) => {
  return (
    <div
      className={classnames(
        'z-20 px-1',
        'bg-[rgba(8,12,24,0.95)] backdrop-blur-xl',
        'border-b border-[rgba(52,140,253,0.2)]',
        'shadow-[0_4px_30px_rgba(0,0,0,0.7),0_0_1px_rgba(52,140,253,0.12)]',
        isSticky && stickyClasses,
        !isSticky && notStickyClasses,
        className
      )}
    >
      {children}
    </div>
  );
};

NavBar.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  isSticky: PropTypes.bool,
};

export default NavBar;
