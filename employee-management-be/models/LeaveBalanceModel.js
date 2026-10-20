import mongoose from "mongoose";

const LeaveBalanceSchema = new mongoose.Schema(
{
    employeeId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Employee",
        unique:true,
        required:true
    },

    casual:{
        total:{type:Number,default:12},
        used:{type:Number,default:0},
        balance:{type:Number,default:12}
    },

    sick:{
        total:{type:Number,default:10},
        used:{type:Number,default:0},
        balance:{type:Number,default:10}
    },

    earned:{
        total:{type:Number,default:15},
        used:{type:Number,default:0},
        balance:{type:Number,default:15}
    },

    compensatory:{
        earned:{type:Number,default:0},
        used:{type:Number,default:0},
        balance:{type:Number,default:0}
    },

    optionalHoliday:{
        total:{type:Number,default:2},
        used:{type:Number,default:0},
        balance:{type:Number,default:2}
    },

    workFromHome:{
        total:{type:Number,default:24},
        used:{type:Number,default:0},
        balance:{type:Number,default:24}
    },

    lossOfPay:{
        used:{type:Number,default:0}
    }
},
{
    timestamps:true
});

export default mongoose.model("LeaveBalance",LeaveBalanceSchema);