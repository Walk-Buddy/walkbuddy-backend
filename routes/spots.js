const express=require('express');
const axios=require('axios');

const router=express.Router();

// 카카오 categoryName 문자열에서 마지막 카테고리 추출, category 값으로 사용
//EX) 여행 > 관광,명소 > 강 -> 강
function getLastCategory(categoryName=''){
    return categoryName.split('>').pop().trim();
}



router.get('/health',(req,res)=>{
    res.json({
        success:true,
        message: 'spot router connected',
    });
});

module.exports=router;