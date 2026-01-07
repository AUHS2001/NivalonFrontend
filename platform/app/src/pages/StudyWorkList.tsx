import React from 'react'
import Header from '../components/header/Header'
import StudyList from '../components/StudyListTable/StudyList'

const StudyWorkList: React.FC = () => {
    return (
        <div className='w-100 h-100 d-flex flex-column'>
            <Header />
            <StudyList/>
        </div>
    )
}

export default StudyWorkList
